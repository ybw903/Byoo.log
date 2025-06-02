import { getPostContent, getPostContents } from "@/src/features/content/api";
import { MarkdownView } from "@/src/features/content/ui/MarkdownView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const postFileName = id.concat(".md");
  const postContent = await getPostContent(postFileName);

  return {
    title: postContent.title,
    description: postContent.summary,
  };
}

export async function generateStaticParams() {
  const postContents = await getPostContents();

  return postContents.map((postContent) => ({ id: postContent.id }));
}

export default async function ContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const postFileName = id.concat(".md");
  const postContent = await getPostContent(postFileName);

  return (
    <main>
      <article>
        <h1 className="text-4xl font-bold">{postContent.title}</h1>
        <p className="mt-2 mb-8 text-xs text-gray-500">{postContent.date}</p>
        <MarkdownView markdownContent={postContent.content} />
      </article>
    </main>
  );
}
