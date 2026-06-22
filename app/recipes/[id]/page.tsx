import CommentCard from "@/components/CommentCard";
import CommentForm from "@/components/CommentForm";
import { getRecipeComments } from "@/lib/actions/comment.actions";
import { getRecipe } from "@/lib/actions/recipe.actions";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const RecipePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id: recipeId } = await params;
  const { userId, has } = await auth();

  if (!userId) redirect("/sign-in");
  
  const hasCommentsAccess = has({ feature: "comments" });

  const [recipe, comments] = await Promise.all([
    getRecipe(recipeId),
    getRecipeComments(recipeId),
  ]);

  if (!recipe) redirect("/recipes");

  return (
    <main className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{recipe.name}</h1>
        <ul className="flex flex-col gap-2">
          {recipe.ingredients.map((ingredient: string) => (
            <li className="list-disc list-inside" key={ingredient}>
              {ingredient}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Instructions</h2>
        <p className="whitespace-pre-wrap">{recipe.instructions}</p>
      </section>
      <section className="flex flex-col gap-4 items-center w-full pt-20">
        <h2 className="text-xl font-bold">Comments</h2>
        <div className="flex flex-col gap-4 items-center w-full">
          {comments.map((comment) => (
            <CommentCard key={comment.id} comment={comment} />
          ))}
          {hasCommentsAccess && <CommentForm recipeId={recipeId} />}
        </div>
      </section>
    </main>
  );
};

export default RecipePage;
