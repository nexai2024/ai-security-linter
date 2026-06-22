import RecipeForm from "@/components/RecipeForm";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const NewRecipePage = async () => {
  const { userId } = await auth();

  if (!userId) redirect("/sign-in");

  return (
    <main>
      <section className="flex flex-col max-w-2xl mx-auto gap-4">
        <h1 className="text-2xl font-bold">Create a new recipe</h1>
        <RecipeForm />
      </section>
    </main>
  );
};

export default NewRecipePage;
