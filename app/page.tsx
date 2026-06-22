export default function Home() {
  return (
    <main>
      <section className="flex flex-col gap-4">
        <h1 className="text-4xl font-bold">Welcome to the SaaS App Template</h1>
        <h2 className="text-2xl font-bold">
          Kickstart your next project with this fully featured template powered
          by Next.js, Shadcn, Clerk, Supabase, and TailwindCSS.
        </h2>
        <p>
          This template serves as a solid foundation for your future SaaS
          projects. To help you get started, we&apos;ve included a sample recipe
          app as a practical example.
        </p>
        <p>
          Dive in and start building right away—or follow the step-by-step
          tutorial on{" "}
          <a
            className="font-semibold underline"
            href="https://jsmastery.com/course/build-launch-your-saas-in-under-7-days"
          >
            JS Mastery Pro
          </a>{" "}
          to learn how to set up your Clerk and Supabase accounts.
        </p>
        <p>
          You can find all the prerequisites and env variables in the Readme.md
        </p>
      </section>
    </main>
  );
}
