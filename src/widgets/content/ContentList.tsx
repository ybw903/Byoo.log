import { getPostContents } from "@/src/features/content/api";
import { toWithoutContent } from "@/src/features/content/lib/utils";
import Link from "next/link";

export const ContentList = async () => {
  const postContents = (await getPostContents()).map(toWithoutContent);

  return (
    <ul>
      {postContents.map((post, idx) => (
        <li
          key={`post-${idx}`}
          className="py-4 hover:scale-[1.005] will-change-transform scale-100 active:scale-100 duration-200 ease-in-out"
        >
          <Link href={`/${post.id}/`}>
            <article>
              <h2 className="text-2xl font-bold mb-2">{post.title}</h2>
              <p className="text-xs text-gray-500">{post.date}</p>
              <p className="text-sm mt-1">{post.summary}</p>
            </article>
          </Link>
        </li>
      ))}
    </ul>
  );
};
