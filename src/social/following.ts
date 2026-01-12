import { supabase } from '../db/supabase.js';
import type { Athlete } from '../types.js';

/**
 * Follow an athlete
 */
export async function followAthlete(followerId: string, followingId: string): Promise<void> {
  if (followerId === followingId) {
    throw new Error('Cannot follow yourself');
  }

  const { error } = await supabase.from('athlete_follows').insert({
    follower_id: followerId,
    following_id: followingId,
  } as any);

  if (error) {
    if (error.code === '23505') {
      // Unique constraint violation - already following
      return;
    }
    throw new Error(`Failed to follow athlete: ${error.message}`);
  }
}

/**
 * Unfollow an athlete
 */
export async function unfollowAthlete(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase
    .from('athlete_follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);

  if (error) {
    throw new Error(`Failed to unfollow athlete: ${error.message}`);
  }
}

/**
 * Check if an athlete is following another
 */
export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('athlete_follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return false; // Not found
    }
    throw new Error(`Failed to check follow status: ${error.message}`);
  }

  return !!data;
}

/**
 * Get all athletes that a user is following
 */
export async function getFollowing(followerId: string): Promise<Athlete[]> {
  const { data, error } = await supabase
    .from('athlete_follows')
    .select(`
      following_id,
      athletes!athlete_follows_following_id_fkey (
        id,
        user_id,
        name,
        normalized_name,
        gender,
        date_of_birth,
        country,
        created_at,
        updated_at
      )
    `)
    .eq('follower_id', followerId);

  if (error) {
    throw new Error(`Failed to get following list: ${error.message}`);
  }

  // Transform the nested data structure
  return (data || []).map((item: any) => item.athletes).filter(Boolean);
}

/**
 * Get all athletes following a user
 */
export async function getFollowers(followingId: string): Promise<Athlete[]> {
  const { data, error } = await supabase
    .from('athlete_follows')
    .select(`
      follower_id,
      athletes!athlete_follows_follower_id_fkey (
        id,
        user_id,
        name,
        normalized_name,
        gender,
        date_of_birth,
        country,
        created_at,
        updated_at
      )
    `)
    .eq('following_id', followingId);

  if (error) {
    throw new Error(`Failed to get followers list: ${error.message}`);
  }

  // Transform the nested data structure
  return (data || []).map((item: any) => item.athletes).filter(Boolean);
}

/**
 * Get follow count for an athlete
 */
export async function getFollowCount(athleteId: string): Promise<{ followers: number; following: number }> {
  const [followersResult, followingResult] = await Promise.all([
    supabase
      .from('athlete_follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', athleteId),
    supabase
      .from('athlete_follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', athleteId),
  ]);

  if (followersResult.error || followingResult.error) {
    throw new Error('Failed to get follow counts');
  }

  return {
    followers: followersResult.count || 0,
    following: followingResult.count || 0,
  };
}
