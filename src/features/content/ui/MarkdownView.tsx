import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";

import "./markdown.css";

export const MarkdownView = async ({
  markdownContent,
}: {
  markdownContent: string;
}) => {
  const postContent = await unified()
    .use(remarkGfm)
    .use(remarkParse)
    .use(remarkRehype, {})
    .use(rehypeStringify)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "wrap",
      properties: {
        className: "linked-heading",
        target: "_self",
      },
    })
    .use(rehypePrettyCode, { theme: "slack-dark" })
    .process(markdownContent);

  return (
    <div
      className="markdown"
      dangerouslySetInnerHTML={{ __html: postContent.toString() }}
    />
  );
};
