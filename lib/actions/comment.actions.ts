"use server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createSupabaseClient } from "../supabase";
import { revalidatePath } from "next/cache";

// Create a new comment
export const createComment = async (comment: string, recipeId: string) => {
  const { userId } = await auth();

  if (!userId) throw new Error("Unauthorized");

  const supabase = createSupabaseClient();

  const { data, error } = await supabase.from("comments").insert({
    comment,
    user_id: userId,
    recipe_id: recipeId,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/recipes/${recipeId}`);

  return data;
};

// Get all comments for a recipe
export const getRecipeComments = async (recipeId: string) => {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const userIds = data.map((comment) => comment.user_id);

  const clerk = await clerkClient();
  const users = await clerk.users.getUserList({ userId: userIds }); // Get user details for each comment's author

  const commentsWithUserDetails = data.map((comment) => {
    const user = users.data.find((user) => user.id === comment.user_id);

    return {
      ...comment,
      userFirstName: user?.firstName,
      userImageUrl: user?.imageUrl,
    };
  });

  return commentsWithUserDetails; // Return the comments with user details
};
