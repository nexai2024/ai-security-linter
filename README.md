<div align="center">
  <br />
    <a href="https://jsmastery.com/course/build-launch-your-saas-in-under-7-days" target="_blank">
      <img src="public/readme/hero.png" alt="Project Banner">
    </a>
  <br />

  <div>
    <img src="https://img.shields.io/badge/-Next.JS-black?style=for-the-badge&logoColor=white&logo=nextdotjs&color=black" alt="next.js" />
        <img src="https://img.shields.io/badge/-Tailwind-00BCFF?style=for-the-badge&logo=tailwind-css&logoColor=white" />
    <img src="https://img.shields.io/badge/-Clerk-6C47FF?style=for-the-badge&logoColor=white&logo=clerk" alt="next.js" />
    <img src="https://img.shields.io/badge/-Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" />
  </div>

  <h3 align="center">SaaS App - LMS with Next.js, Supabase & Payments</h3>

   <div align="center">
     Build this project step by step with our detailed tutorial on <a href="https://jsmastery.com/course/build-launch-your-saas-in-under-7-days" target="_blank"><b>JavaScript Mastery</b></a> platform. Join the JSM family!
    </div>
</div>

## 📋 <a name="table">Table of Contents</a>

1. 🤖 [Introduction](#introduction)
2. ⚙️ [Tech Stack](#tech-stack)
3. 🔋 [Features](#features)
4. 🤸 [Quick Start](#quick-start)
5. 🔗 [Assets](#links)
6. 🚀 [More](#more)

## 🚨 Tutorial

This repository contains the code corresponding to an in-depth tutorial available on our Platform, <a href="https://jsmastery.com/" target="_blank"><b>JS Mastery Pro</b></a>.

## <a name="introduction">🤖 Introduction</a>

Supercharge your SaaS app launch with this high-powered template – packed with built-in user auth, subscriptions, and payments using Next.js, Supabase, and Stripe! Hit the ground running and turn your idea into reality faster than ever.

If you're getting started and need assistance or face any bugs, join our active Discord community with over **50k+** members. It's a place where people help each other out.

<a href="https://discord.com/invite/n6EdbFJ" target="_blank"><img src="https://github.com/sujatagunale/EasyRead/assets/151519281/618f4872-1e10-42da-8213-1d69e486d02e" /></a>

## <a name="tech-stack">⚙️ Tech Stack</a>

- **[Clerk](https://jsm.dev/converso-clerk)** is a unified platform for authentication, user management, and billing. It offers embeddable UI components, flexible APIs, and admin dashboards for secure user management. Clerk also simplifies subscription management, allowing you to define plans, create pricing pages, and control access based on subscription tiers—all in one solution.

* **[Next.js](https://nextjs.org/)** is a powerful React framework that enables the development of fast, scalable web applications with features like server-side rendering, static site generation, and API routes for building full-stack applications.

* **[shadcn/ui](https://ui.shadcn.com/)** is a customizable component library built on Radix UI and Tailwind CSS. It offers a modern, accessible design system with pre-built components that are easy to theme and extend, making it ideal for building polished UIs with minimal effort.

- **[Supabase](https://supabase.com/)** is an open-source backend-as-a-service platform that provides instant APIs, real-time subscriptions, authentication, storage, and a PostgreSQL database, enabling developers to build scalable and secure applications with ease.

* **[Tailwind CSS](https://tailwindcss.com/)** is a utility-first CSS framework that allows developers to design custom user interfaces by applying low-level utility classes directly in HTML, streamlining the design process.

* **[TypeScript](https://www.typescriptlang.org/)** is a superset of JavaScript that adds static typing, providing better tooling, code quality, and error detection for developers, making it ideal for building large-scale applications.

* **[Zod](https://zod.dev/)** is a TypeScript-first schema validation library that provides a simple and expressive way to define and validate data structures. Zod ensures data integrity by catching errors early during development.

## <a name="features">🔋 Features</a>

👉 **Authentication**: Secure user sign-up and sign-in with Clerk; Google authentication and many more.

👉 **Billing & Subscriptions**: Easily manage plans, upgrades, and payment details.

👉 **Code Reusability**: Leverage reusable components and a modular codebase for efficient development.

👉 **Cross-Device Compatibility**: Fully responsive design that works seamlessly across all devices.

👉 **Database Integration**: Uses Supabase for real-time data handling and storage needs.

👉 **No opinionated UI**: Easily bring your own style to the app, without the need for removing leftover styles.

👉 **Scalable Tech Stack**: Built with Next.js for a fast, production-ready web application that scales seamlessly.

## <a name="quick-start">🤸 Quick Start</a>

Follow these steps to set up the project locally on your machine.

**Prerequisites**

Make sure you have the following installed on your machine:

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/en)
- [npm](https://www.npmjs.com/) (Node Package Manager)

**Cloning the Repository**

```bash
git clone https://github.com/JavaScript-Mastery-Pro/saas-template.git
cd saas-template
```

**Installation**

Install the project dependencies using npm:

```bash
npm install
```

**Set Up Environment Variables**

Create a new file named `.env` in the root of your project and add the following content:

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Replace the placeholder values with your actual Supabase and Clerk credentials. You can obtain these by signing up on: [Supabase](https://supabase.com/dashboard), [Clerk](https://jsm.dev/converso-clerk).

**Running the Project**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the project.

## <a name="links">🔗 Assets</a>

You can find the example database schema in the root of this repository.

## <a name="more">🚀 More</a>

**Advance your skills with Next.js Pro Course**

Enjoyed creating this project? Dive deeper into our PRO courses for a richer learning adventure. They're packed with
detailed explanations, cool features, and exercises to boost your skills. Give it a go!

<a href="https://jsm.dev/converso-nextjs" target="_blank">
  <img src="public/readme/jsmpro.png" alt="Project Banner">
</a>
