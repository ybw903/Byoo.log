---
title: "ESLint Flag Config란?"
date: "2026-02-13"
tags: ["ESlint"]
summary: "ESLint Flag Config에 대해 알아보자."
---

ESLint 9버전 부터 기존에 lint 설정을 위해 사용하던 `.eslintrc.js`나 `.eslintrc.json` 대신 eslint.config.js(Flat Config) 설정 파일 기반으로 린트 설정을 하게됩니다.

## 1. Flat Config의 특징

- **단일 설정 파일**

  기존에는 프로젝트의 여러 폴더에 .eslintrc 파일이 흩어져 있고, 상위 폴더의 설정을 상속(Cascading)받는 구조라 최종적으로 어떤 규칙이 적용되는지 파악하기 어려웠습니다. Flat Config는 오직 하나의 eslint.config.js (또는 .mjs, .cjs) 파일에서 모든 설정을 관리합니다.

- **배열(Array) 기반의 구조**

  파일은 단일 객체가 아닌 객체들의 배열을 export 합니다. ESLint는 이 배열을 위에서부터 아래로 순서대로 평가하며, 뒤에 있는 설정이 앞의 설정을 덮어씁니다.

- **문자열 대신 직접 import (Magic String 제거)**

  기존에는 플러그인이나 확장 설정을 `"extends": "plugin:react/recommended"` 처럼 문자열로 적어 ESLint가 알아서 모듈을 찾게 했습니다. Flat Config에서는 자바스크립트 모듈을 다루듯 플러그인과 설정을 직접 import 하여 객체에 할당합니다.

- **명시적인 타겟팅 (files, ignores)**

  각 설정 객체 안에 files와 ignores 속성을 정의하여, 해당 설정 규칙이 어떤 파일(예: `\*_/_.ts`)에만 적용될지 매우 명확하게 지정할 수 있습니다.

## 2. 구조 비교 및 예시

- **기존 방식 (.eslintrc.js)**

  플러그인과 확장을 문자열로 불러오며, 파일별 설정은 overrides라는 별도의 복잡한 배열을 사용해야 했습니다.

  ```js
  // 구형 방식 (.eslintrc.js)
  module.exports = {
    env: { browser: true, es2021: true },
    extends: ["eslint:recommended", "plugin:react/recommended"],
    plugins: ["react"],
    rules: {
      semi: ["error", "always"],
    },
    overrides: [
      {
        files: ["**/*.test.js"],
        env: { jest: true },
      },
    ],
  };
  ```

- **새로운 Flat Config 방식 (eslint.config.js)**

  모든 것이 자바스크립트 배열과 객체로 직관적으로 구성됩니다.

  ```js
  // 신형 방식 (eslint.config.js)
  import js from "@eslint/js";
  import reactPlugin from "eslint-plugin-react";
  import globals from "globals";
  export default [
    // 1. 기본 추천 설정 (배열에 바로 추가)
    js.configs.recommended,

    // 2. 전체 적용할 커스텀 설정
    {
      languageOptions: {
        globals: {
          ...globals.browser, // 브라우저 전역 변수 인식
        },
      },
      rules: {
        semi: ["error", "always"],
      },
    },

    // 3. 특정 파일(React)에만 적용할 설정
    {
      files: ["**/*.jsx", "**/*.tsx"],
      plugins: {
        react: reactPlugin,
      },
      rules: {
        ...reactPlugin.configs.recommended.rules,
        "react/react-in-jsx-scope": "off",
      },
    },

    // 4. 무시할 파일 및 디렉토리
    {
      ignores: ["dist/", "build/", "node_modules/"],
    },
  ];
  ```

## 3. Flat Config 마이그레이션

- **방법1: 공식 마이그레이션 도구 사용**

  1. 프로젝트 루트 경로에서 아래 명령어를 실행합니다.

     ```sh
     npx @eslint/migrate-config .eslintrc.js
     ```

  2. 도구가 기존 설정을 분석하여 eslint.config.js (또는 프로젝트 환경에 따라 eslint.config.mjs) 파일을 생성해 줍니다.

  3. 생성된 코드를 보며 의도대로 잘 변환되었는지 검토하고 미세 조정합니다.

- **방법2: 직접 마이그레이션**

  1. 환경(env) 설정은 globals 패키지로 대체

     기존에는 `browser: true, node: true`와 같이 문자열로 전역 변수 환경을 지정했습니다. Flat Config에서는 별도의 globals 패키지를 설치하고 명시적으로 주입해야 합니다.

     - 설치: `npm install globals -D`

     - 변경:

       ```js
       // AS-IS (.eslintrc)
       env: { browser: true, node: true }

       // TO-BE (eslint.config.js)
       import globals from "globals";
       export default [
        {
          languageOptions: {
            globals: {
              ...globals.browser,
              ...globals.node
            }
          }
        }
       ];
       ```

  2. extends 문자열을 실제 모듈 import로 변경

     가장 큰 변화입니다. `"eslint:recommended"` 같은 매직 스트링 대신 패키지를 직접 불러옵니다.

     - 설치: `@eslint/js` 패키지가 필요할 수 있습니다. `npm install @eslint/js -D`

     - 변경:

       ```js
       // AS-IS (.eslintrc)
       extends: ["eslint:recommended"]

       // TO-BE (eslint.config.js)
       import js from "@eslint/js";
       export default [
         js.configs.recommended
       ];
       ```

  3. 플러그인(plugins) 등록 방식 변경

     플러그인 역시 문자열 이름이 아닌, import 한 모듈 객체 자체를 plugins 객체에 매핑해 주어야 합니다.

     - 변경:

       ```js
       // AS-IS (.eslintrc)
       plugins: ["react"];

       // TO-BE (eslint.config.js)
       import reactPlugin from "eslint-plugin-react";
       export default [
         {
           plugins: {
             react: reactPlugin,
           },
         },
       ];
       ```

  4. .eslintignore 통합

     더 이상 별도의 무시 파일(`.eslintignore`)을 관리할 필요가 없습니다. 배열 내에 ignores 속성만 가진 객체를 하나 추가하면 전역 무시 설정으로 동작합니다.

     - 변경:

       ```js
       export default [
         { ignores: ["dist/", "build/", ".next/"] }, // 전역 무시 설정
         // ... 다른 설정들
       ];
       ```
