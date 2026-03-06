import { IPost } from "../type";

export const toWithoutContent = (post: IPost): Omit<IPost, "content"> => ({
  id: post.id,
  title: post.title,
  tags: post.tags,
  date: post.date,
  summary: post.summary,
});

export const sortByDate = (a: IPost, b: IPost) => {
  return new Date(b.date).getTime() - new Date(a.date).getTime();
};
