import fs from "fs";
import path from "path";
import matter from "gray-matter";

import { IPost } from "../type";

const MARKDOWN_CONTENT_ROOT_DIR = path.join(process.cwd(), "contents");

export const getPostContents = async (): Promise<IPost[]> => {
  const markdownFileDirs = await getMarkdownFileDirs();
  return await Promise.all(markdownFileDirs.map((dir) => getPostContent(dir)));
};

const getMarkdownFileDirs = async () => {
  const markdownFileDirs = await fs.promises.readdir(MARKDOWN_CONTENT_ROOT_DIR);

  return markdownFileDirs.filter((markdownFileDir) =>
    markdownFileDir.endsWith(".md")
  );
};

export const getPostContent = async (dir: string): Promise<IPost> => {
  const id = dir.replace(".md", "");
  const postPath = path.join(MARKDOWN_CONTENT_ROOT_DIR, dir);
  const markdownFile = await fs.promises.readFile(postPath, "utf-8");

  const {
    data: { title, date, tags, summary },
    content,
  } = matter(markdownFile);

  return {
    id,
    title,
    date,
    tags,
    summary,
    content,
  };
};
