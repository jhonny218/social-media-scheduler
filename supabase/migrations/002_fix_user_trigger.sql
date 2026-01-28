-- Fix the handle_new_user trigger to properly create sch_users records
-- This addresses RLS policy issues when auth users are created

-- Drop any old policies
DROP POLICY IF EXISTS "Service role can insert users" ON sch_users;
DROP POLICY IF EXISTS "Enable insert for service role" ON sch_users;
DROP POLICY IF EXISTS "Users can insert own data" ON sch_users;

-- Recreate the insert policy to work with both regular users and triggers
CREATE POLICY "Users can insert own data" ON sch_users
  FOR INSERT WITH CHECK (
    auth.uid() = id OR
    current_setting('role') = 'service_role'
  );

-- Update the trigger function with better error handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.sch_users (id, email, display_name, photo_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't block the auth user creation
    RAISE WARNING 'Error creating sch_users record: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
