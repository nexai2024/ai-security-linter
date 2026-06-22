import RecipeCard from "@/components/RecipeCard";
import { Button } from "@/components/ui/button";
import { getRecipes } from "@/lib/actions/recipe.actions";
import Link from "next/link";

const AllRecipesPage = async () => {
  const recipes = await getRecipes();

  return (
    <main>
      <section className="flex flex-col gap-4">
        <div className="flex flex-row justify-between items-center max-sm:flex-col max-sm:gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Recipes</h1>
            <p className="text-sm text-gray-500">
              Browse through our collection of recipes
            </p>
          </div>
          <Link href="/recipes/new" className="max-sm:w-full">
            <Button className="max-sm:w-full">Create Recipe</Button>
          </Link>
        </div>
        <section className="flex flex-wrap gap-4 max-sm:flex-col max-sm:items-center ">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              name={recipe.name}
              ingredients={recipe.ingredients.length}
              id={recipe.id}
              userName={recipe.userFirstName!}
              userImageUrl={recipe.userImageUrl!}
              unlocked={recipe.unlocked}
            />
          ))}
        </section>
      </section>
    </main>
  );
};

export default AllRecipesPage;
