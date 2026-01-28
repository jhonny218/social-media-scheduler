-- Fix the handle_new_user trigger to properly create sch_users records
-- This addresses RLS policy issues when auth users are created

-- Drop the old overly permissive policy if it exists
DROP POLICY IF EXISTS "Service role can insert users" ON sch_users;

-- Add proper service role policy
CREATE POLICY "Enable insert for service role" ON sch_users
  FOR INSERT TO service_role WITH CHECK (true);

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
