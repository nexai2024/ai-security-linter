"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Form,
  FormMessage,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "./ui/form";
import { Button } from "./ui/button";
import { createComment } from "@/lib/actions/comment.actions";
import { Textarea } from "./ui/textarea";

const formSchema = z.object({
  comment: z.string().min(1, {
    message: "Comment is required.",
  }),
});

const CommentForm = ({ recipeId }: { recipeId: string }) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      comment: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    await createComment(values.comment, recipeId);
  };

  return (
    <div className="flex flex-col gap-4 w-xl max-sm:w-full">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormField
            control={form.control}
            name="comment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New Comment</FormLabel>
                <FormControl>
                  <Textarea placeholder="Your comment..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full">
            Comment
          </Button>
        </form>
      </Form>
    </div>
  );
};

export default CommentForm;
