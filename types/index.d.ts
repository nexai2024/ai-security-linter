export type Recipe = {
  id?: string;
  name: string;
  ingredients: string[];
  instructions: string;
};

export type Comment = {
  id?: string;
  comment: string;
  created_at: string;
  user_id: string;
  recipe_id: string;
};
