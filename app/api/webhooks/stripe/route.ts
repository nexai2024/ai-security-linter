import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServiceClient } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia" as any,
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    if (!endpointSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    }
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[Stripe Webhook] Error: ${error.message}`);
    return NextResponse.json({ error: `Webhook Error: ${error.message}` }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId = session.metadata?.clerk_user_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (clerkUserId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0].price.id;

          let planType = "FREE";
          let scanLimit = 10;

          if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
            planType = "PRO";
            scanLimit = 100;
          } else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) {
            planType = "ENTERPRISE";
            scanLimit = 1000;
          }

          await supabase
            .from("accounts")
            .update({
              stripe_customer_id: customerId,
              subscription_id: subscriptionId,
              plan_type: planType,
              scan_limit: scanLimit,
            })
            .eq("clerk_user_id", clerkUserId);
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0].price.id;

        let planType = "FREE";
        let scanLimit = 10;

        if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
          planType = "PRO";
          scanLimit = 100;
        } else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) {
          planType = "ENTERPRISE";
          scanLimit = 1000;
        }

        if (subscription.status === "active") {
          await supabase
            .from("accounts")
            .update({
              plan_type: planType,
              scan_limit: scanLimit,
            })
            .eq("stripe_customer_id", customerId);
        } else {
             await supabase
            .from("accounts")
            .update({
              plan_type: "FREE",
              scan_limit: 10,
            })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await supabase
          .from("accounts")
          .update({
            plan_type: "FREE",
            scan_limit: 10,
            subscription_id: null,
          })
          .eq("stripe_customer_id", customerId);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`[Stripe Webhook] Database Error: ${err.message}`);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
