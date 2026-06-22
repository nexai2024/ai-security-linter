import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  getUnlockedRecipes,
  getUserRecipes,
} from "@/lib/actions/recipe.actions";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const MyCookBookPage = async () => {
  const { userId } = await auth();

  if (!userId) redirect("/sign-in");

  const userRecipes = await getUserRecipes();
  const unlockedRecipes = await getUnlockedRecipes();

  return (
    <main>
      <Accordion type="single" collapsible>
        <AccordionItem value="my-recipes">
          <AccordionTrigger className="text-2xl font-bold">
            My Recipes
          </AccordionTrigger>
          <AccordionContent>
            {userRecipes.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {userRecipes.map((recipe) => (
                  <Link href={`/recipes/${recipe.id}`} key={recipe.id}>
                    <li className="text-lg font-bold list-disc list-inside">
                      {recipe.name}
                    </li>
                  </Link>
                ))}
              </ul>
            ) : (
              <p>
                You haven&apos;t created any recipes yet.{" "}
                <Link href="/recipes/new" className="font-semibold underline">
                  Create one now
                </Link>
                .
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="unlocked-recipes">
          <AccordionTrigger className="text-2xl font-bold">
            Unlocked Recipes
          </AccordionTrigger>
          <AccordionContent>
            {unlockedRecipes.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {unlockedRecipes.map((recipe) => (
                  <Link href={`/recipes/${recipe.id}`} key={recipe.id}>
                    <li className="text-lg font-bold list-disc list-inside">
                      {recipe.name}
                    </li>
                  </Link>
                ))}
              </ul>
            ) : (
              <p>You haven&apos;t unlocked any recipes yet.</p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </main>
  );
};

export default MyCookBookPage;
