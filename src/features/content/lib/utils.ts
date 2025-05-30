import { IPost } from "../type";

export const toWithoutContent = (post: IPost): Omit<IPost, "content"> => ({
  id: post.id,
  title: post.title,
  tags: post.tags,
  date: post.date,
  summary: post.summary,
});
