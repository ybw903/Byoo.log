---
title: "Prisma란?"
date: "2026-05-30"
tags: ["Prisma", "ORM", "Next.js"]
summary: "Prisma란 무엇인지 알아보고 사용방법에 대해 알아봅니다."
---

# Prisma란?

**Prisma ORM**은 타입 안전성을 보장하는 데이터베이스 접근, 마이그레이션, 시각적 데이터 편집기를 제공하는 차세대 Node.js 및 TypeScript ORM입니다. 기존 ORM(TypeORM, Sequelize 등)의 한계를 넘어 개발자 경험(DX)을 극대화하는 데 초점을 맞추고 있습니다.

---

## 1. Prisma와 기존 ORM의 차이점

Prisma는 다른 ORM들과 아래와 같은 뚜렷한 차별점을 가집니다.

1.  **선언형 스키마 (SSoT):** `schema.prisma`라는 별도의 DSL 파일을 사용합니다. 이 파일 하나만으로 DB 구조, 관계, 클라이언트 설정을 한눈에 파악할 수 있는 **Single Source of Truth** 역할을 합니다.
2.  **자동 생성된 타입 안전성:** 스키마를 기반으로 Prisma Client를 자동 생성합니다. 개발자가 수동으로 인터페이스를 정의할 필요 없이, DB 필드에 최적화된 자동 완성 기능을 누릴 수 있습니다.
3.  **Rust 기반의 쿼리 엔진:** 내부적으로 Rust로 작성된 Prisma Engine이 동작합니다. Node.js 외부에서 쿼리를 최적화하여 실행하므로 복잡한 Join 연산 등에서 오버헤드를 줄여줍니다.

---

## 2. Prisma Client

### Prisma Client 개요

Prisma Client는 내 데이터베이스 구조에 맞춰 **자동으로 생성되는 맞춤형 쿼리 빌더**입니다.

- **강력한 타입 안전성:** `npx prisma generate`를 실행하면 프로젝트 내 `node_modules`에 내 DB 전용 타입 코드가 생성되어 런타임 에러를 사전에 방지합니다.
- **직관적인 API:** SQL 문법을 복잡하게 흉내 내기보다 코드를 읽기 쉽게 설계되었습니다.

```typescript
// 예시: 사용자 정보와 해당 사용자의 게시글까지 한 번에 조회
const userWithPosts = await prisma.user.findUnique({
  where: { id: 1 },
  include: { posts: true }, // SQL Join을 객체 지향적으로 처리
});
```

### Prisma Client 동작 과정

1.  **모델링:** `schema.prisma`에 데이터 모델을 정의합니다.
2.  **생성:** `npx prisma generate` 명령어를 실행합니다.
3.  **엔진 빌드:** Rust 엔진이 스키마를 분석하여 최적화된 TS 인터페이스와 쿼리 로직을 생성합니다.
4.  **호출:** 애플리케이션 코드에서 `PrismaClient` 인스턴스를 통해 DB를 조작합니다.

### Prisma Adapter

기본적으로 Prisma는 TCP 소켓을 통해 DB와 통신합니다. 하지만 **Prisma Adapter**를 사용하면 Cloudflare Workers나 PlanetScale처럼 **TCP 연결이 제한된 서버리스/엣지 환경**에서도 전용 드라이버를 통해 안정적으로 통신할 수 있게 연결해 주는 다리 역할을 합니다.

---

## 3. Prisma Schema

Prisma 스키마는 프로젝트의 설계도입니다. 일반적으로 `schema.prisma` 파일에서 관리하며 크게 세 가지 섹션으로 구성됩니다.

### ① Data Source

어떤 데이터베이스를 사용할지, 연결 주소는 무엇인지 설정합니다.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### ② Generators

스키마를 바탕으로 어떤 산출물을 만들지 결정합니다.

```prisma
generator client {
  provider = "prisma-client-js" // 핵심! JS/TS 클라이언트 생성
}
```

### ③ Data Model

실제 테이블 구조와 관계를 정의합니다.

```prisma
model User {
id Int @id @default(autoincrement())
email String @unique
name String?
role Role @default(USER)
posts Post[]
profile Profile?
}

model Profile {
id Int @id @default(autoincrement())
bio String
user User @relation(fields: [userId], references: [id])
userId Int @unique
}

model Post {
id Int @id @default(autoincrement())
title String
author User @relation(fields: [authorId], references: [id])
authorId Int
}

enum Role {
USER
ADMIN
}

```

- **Model:** 여러 필드를 정의하고 다른 모델과의 연관 관계를 설정합니다.
- **Enums:** 데이터베이스 수준에서 열거형 타입을 지원할 때 사용합니다.

---

## 4. 개인적인 사용 경험

추가로 최근 Prisma 7 버전을 실무에 도입하면서 겪었던 인상 깊은 경험 두 가지를 공유합니다.

### ① MySQL 커넥터 이슈와 MariaDB 우회 연결

기존 버전들에서는 Prisma Engine(Rust 바이너리) 내부에 데이터베이스와 직접 통신하는 TCP 기반 드라이버가 내장되어 있었습니다.

하지만 7버전부터는 이 내장 드라이버들을 덜어내고, 'JS 기반 드라이버 어댑터(Driver Adapter)' 방식으로 완전히 전환했습니다.

Vercel Edge Runtime이나 Cloudflare Workers 같은 현대적인 엣지 컴퓨팅 환경은 보안과 리소스 관리 차원에서 표준 TCP 소켓 연결을 차단합니다.

과거에는 Rust 내장 드라이버는 TCP 연결을 고집했기 때문에 엣지 환경에서 Prisma를 실행하는 것이 사실상 불가능하거나 매우 불안정했습니다.

변경된 버전에서는 JS 기반 드라이버 어댑터로 전환하면서, HTTP나 WebSocket을 통해 DB와 통신하는 엣지 호환 드라이버(예: @planetscale/database, @neondatabase/serverless)를 Prisma에 직접 연결할 수 있게 되었습니다.

이에 따라 표준 MySQL 커넥터를 사용하기 어려운 상황이 있었습니다. 따라서 MySQL과 호환성이 높은 MariaDB 커넥터를 대신 사용하도록 하여 사용했습니다..

### ② DB 네이밍 컨벤션 대응 (Snake Case to Camel Case)

대부분의 레거시 DB나 표준 관례는 필드명에 `snake_case`를 사용합니다. 하지만 TypeScript 프로젝트에서는 `camelCase`를 쓰는 것이 일반적이죠. 그래서 저는 `@map` 속성을 적극 활용해 이 간극을 메웠습니다.

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  userName  String   @map("user_name") // DB: user_name -> Code: userName
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("users") // 테이블명 매핑
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  authorId  Int      @map("author_id")
  author    User     @relation(fields: [authorId], references: [id])

  @@map("posts")
}
```

## 마치며

Prisma는 강력한 타입 추론 덕분에 개발 과정에서 발생할 수 있는 런타임 에러를 획기적으로 줄여줍니다. 특히 실무에서 마주하는 아키텍처의 변화나 컨벤션 차이를 위와 같이 유연하게 극복할 수 있다는 점에서, 현대적인 웹 생태계를 구축할 때 매우 매력적인 선택지라고 생각합니다.
