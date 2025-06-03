---
title: "Next.js에서 generateStaticParams에 대해 알아보자 (App Router에서 SSG, ISR)"
date: "2025-06-03"
tags: ["Next.js"]
summary: "Next.js는 dynamic route segments와 generateStaticParams을 활용해 빌드 시점에 렌더링된 정적 페이지를 생성합니다."
---

> 이 글은 Next.js 15버전 **App Router** 기반으로 작성되었습니다.<br/>
> 만약, Page Router 기반이라면, [getStaticPaths](https://nextjs.org/docs/pages/building-your-application/data-fetching/get-static-paths), [getStaticProps](https://nextjs.org/docs/pages/building-your-application/data-fetching/get-static-props)를 참고해주세요.

먼저 Next.js 13버전 **App Router** 사용 시, 추가된 `generateStaticParams` 함수를 알아보기 전에 간략하게 **SSG**에 대해 알아두고 넘어가겠습니다.

> 페이지에서 `Static Generation`을 사용하는 경우, 페이지 HTML은 빌드 시점에 생성됩니다. 즉, 프로덕션 환경에서는 다음 빌드를 실행할 때 페이지 HTML이 생성됩니다. 이 HTML은 각 요청에서 재사용되며, CDN에서 캐시할 수 있습니다.<br/>
> Next.js에서는 데이터가 있거나 없는 페이지를 정적으로 생성할 수 있습니다.<br/>- [Next.js문서](https://nextjs.org/docs/pages/building-your-application/rendering/static-site-generation#static-generation-without-data)

이와 같이, 매 요청마다 HTML을 생성하는 **SSR**과 달리, 빌드 시점에 HTML을 생성하는 방식을 **SSG**라고 합니다.

만약, 데이터가 빌드 시점에만 변경되는 경우라면, 매 요청마다 서버리소스를 사용하는 **SSR**보다 빌드 시점에만 서버 리소스를 사용하는 **SSG**가 보다 적합한 방식이 될 수 있습니다.

이런 **SSG**를 적용시키기 위해서, `데이터가 필요 없는 경우`라면, 단순히 `Route Segment`에 `Page` 컴포넌트를 추가해주면 적용 시킬 수 있습니다.

```jsx
// app/page.tsx
function RootPage() {
  return <div>RootPage</div>;
}

export default RootPage;
```

다만, 이 때, 생성되는 HTML은 `Static` 방식으로 **Next.js의 캐싱** 적용에 따라 `Dynamic Rendering(SSR)` 방식으로 렌더링 될 수 있습니다.

만약 데이터가 `필요한 경우`라면, `Dynamic Route Segments`의 `Page` 컴포넌트에서 `generateStaticParams`함수를 사용하여, 데이터를 사용해 HTML을 생성할 수 있습니다.

## generateStaticParams

**SSG**를 적용하려면, `Dynamic Route Segments`의 `Page` 컴포넌트에서 `Dynamic Segments`에 해당하는 객체 배열을 반환해주는 `generateStaticParams`함수를 선언해주면 됩니다.

```tsx
// app/[id]/page.tsx
export function generateStaticParams() {
  return [{ id: "1" }, { id: "2" }, { id: "3" }];
}

// Three versions of this page will be statically generated
// using the `params` returned by `generateStaticParams`
// - /1
// - /2
// - /3
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <div>{id} page</div>;
}
```

단순히 지정된 데이터를 반환해야한다면, 위의 코드 같이 사용할 수도 있지만, **SSG** 방식은 빌드 시점에 서버리소스를 사용할 수 있으므로, 서버로부터 데이터를 가져와 `Dynamic Segments`에 해당하는 객체 배열을 생성하여 반환해 줄 수도 있습니다.

```tsx
// app/[id]/page.tsx
export function generateStaticParams() {
  const posts = await fetch("https://.../posts").then((res) => res.json());

  return posts.map((post) => ({
    id: post.id,
  }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <div>{id} page</div>;
}
```

이제 위에서 작성한 `Page` 컴포넌트 들이 위치한 프로젝트를 빌드하면, 아래와 같이 **SSG**로 생성된 빌드 결과를 확인해볼 수 있습니다.

![빌드 결과](/images/Generation-Static-Params1.png)

## ISR

앞 서 본 결과에서 만약, `generateStaticParams`함수에서 반환해주는 값이 빈 배열이 였다면, 혹은 `/4` 와 같이 생성하지 않은 페이지의 URL에 접근 한다면, 어떤 `page`가 생성될까요?

브라우저에 URL을 입력해서 확인해보시면, 빌드시점에 생성한 데이터가 아니라 URL path를 데이터로 `page`가 표시되는걸 확인해보실 수 있습니다.

그렇다면, 해당 페이지는 매 요청시마다 페이지를 생성하는 **SSR**을 통해 렌더링 된 것 일까요?

`Dynamic Rendering(SSR)`방식의 경우, 매 요청마다 HTML을 생성하여 응답으로 보내주므로, 생성한 HTML을 저장하지 않지만, 이와 다르게 `.next/server/app` 디렉토리를 확인해보시면, 빌드가 끝난 후, 확인할 수 없던 `4.html`이 추가로 생성된 걸 확인해보실 수 있습니다.

이와 같은 방식을 **ISR**이라 하고, 개발자가 적절하게 빌드시점에 생성할 `page`와 실행시점에 생성할 `page`를 나누어 렌더링 할 수 있도록 해줍니다.

이 때, 추가로 **next.js의 캐시**를 사용하여, 기존에 생성된 페이지 역시 갱신하여, 생성해 줄 수도 있고 추가로 페이지를 생성해 줄 수도 있습니다. 이를 통해서, 개발자는 빌드 시점이외에도 특정한 시점마다 반영이 필요한 데이터를 반영시켜 `page`를 갱신하거나 추가해줄 수 있습니다.

이와 관련된 자세한 내용은 다음에 **next.js의 캐시** 글에 추가로 소개하도록 하겠습니다.

## dynamicParams

```tsx
// app/[id]/page.tsx
export function generateStaticParams() {
  const posts = await fetch("https://.../posts").then((res) => res.json());

  // [{id: '1'}, {id: '2'}, {id: '3'}]
  return posts.map((post) => ({
    id: post.id,
  }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  //`https://.../posts/4`
  await fetch(`https://.../posts/${id}`).then((res) => res.json());

  return <div>{id} page</div>;
}
```

만약 위와 같이 생성하지 않은 페이지의 URL인 `/4`에 접근 할 때, 서버에서 데이터를 가져올 수 없어 에러가 발생한다면 어떻게 해야할까요?

Next.js에서는 위와 같이 `generateStaticParams`함수가 반환하지 않은 `dynamic segment`에 접근할 떄, `404`를 반환해주는 [dynamicParams](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamicparams) 옵션을 지원합니다.

해당 페이지에 나온 대로, `dynamicParams`의 값을 `false`로 할당해주면, `404`페이지가 반환되는걸 확인해보실 수 있습니다.
