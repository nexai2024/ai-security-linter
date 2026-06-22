import React from "react";
import Image from "next/image";

interface CommentCardProps {
  comment: {
    id: string;
    comment: string;
    userFirstName: string;
    userImageUrl: string;
    created_at: string;
  };
}
const CommentCard = ({ comment }: CommentCardProps) => {
  return (
    <article className="flex flex-col gap-2 border shadow-sm p-4 rounded-md w-xl max-sm:w-full">
      <div className="flex flex-row items-center gap-2 justify-between">
        <span className="flex flex-row items-center gap-2">
          <Image
            src={comment.userImageUrl}
            alt={comment.userFirstName}
            width={32}
            height={32}
            className="rounded-full"
          />
          <p className="font-bold">{comment.userFirstName}</p>
        </span>
        <p className="text-sm text-gray-500">
          {new Date(comment.created_at).toLocaleDateString()}
        </p>
      </div>
      <p>{comment.comment}</p>
    </article>
  );
};

export default CommentCard;
