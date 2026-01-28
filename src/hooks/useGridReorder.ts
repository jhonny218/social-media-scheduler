import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { supabase, TABLES } from '../config/supabase';
import { ScheduledPost } from '../types';
import {
  sortPostsByScheduledTime,
  calculateNewScheduledTime,
  reorderArray,
} from '../utils/gridHelpers';

interface UseGridReorderReturn {
  isReordering: boolean;
  reorderPost: (
    posts: ScheduledPost[],
    postId: string,
    sourceIndex: number,
    destinationIndex: number
  ) => Promise<ScheduledPost[]>;
  optimisticReorder: (
    posts: ScheduledPost[],
    sourceIndex: number,
    destinationIndex: number
  ) => ScheduledPost[];
}

export const useGridReorder = (userId: string): UseGridReorderReturn => {
  const [isReordering, setIsReordering] = useState(false);

  /**
   * Optimistically reorder posts in memory (for immediate UI feedback)
   */
  const optimisticReorder = useCallback(
    (
      posts: ScheduledPost[],
      sourceIndex: number,
      destinationIndex: number
    ): ScheduledPost[] => {
      const sortedPosts = sortPostsByScheduledTime(posts);
      return reorderArray(sortedPosts, sourceIndex, destinationIndex);
    },
    []
  );

  /**
   * Reorder a post and update its scheduled time in database
   */
  const reorderPost = useCallback(
    async (
      posts: ScheduledPost[],
      postId: string,
      sourceIndex: number,
      destinationIndex: number
    ): Promise<ScheduledPost[]> => {
      if (sourceIndex === destinationIndex) {
        return posts;
      }

      setIsReordering(true);

      try {
        // Sort posts by scheduled time
        const sortedPosts = sortPostsByScheduledTime(posts);

        // Find the post being moved
        const postToMove = sortedPosts.find((p) => p.id === postId);
        if (!postToMove) {
          throw new Error('Post not found');
        }

        // Create the reordered array (without the moved post)
        const postsWithoutMoved = sortedPosts.filter((p) => p.id !== postId);

        // Calculate new scheduled time based on destination
        const newScheduledTime = calculateNewScheduledTime(
          postsWithoutMoved,
          destinationIndex
        );

        // Update in database
        const { error } = await supabase
          .from(TABLES.SCHEDULED_POSTS)
          .update({
            scheduled_time: newScheduledTime.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', postId)
          .eq('user_id', userId);

        if (error) {
          throw error;
        }

        // Create updated post
        const updatedPost: ScheduledPost = {
          ...postToMove,
          scheduledTime: newScheduledTime.toISOString(),
        };

        // Insert at new position
        const newPosts = [...postsWithoutMoved];
        newPosts.splice(destinationIndex, 0, updatedPost);

        toast.success('Post reordered successfully');
        return sortPostsByScheduledTime(newPosts);
      } catch (error) {
        console.error('Error reordering post:', error);
        toast.error('Failed to reorder post');
        return posts; // Return original order on failure
      } finally {
        setIsReordering(false);
      }
    },
    [userId]
  );

  return { isReordering, reorderPost, optimisticReorder };
};

export default useGridReorder;
