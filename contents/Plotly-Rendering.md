---
title: "Plotly.js 렌더링 분석"
date: "2026-03-06"
tags: ["plotly"]
summary: "Plotly.js가 차트를 어떻게 렌더링 하는지 알아봅니다."
---

데이터 시각화를 위해 Python, R, JavaScript 생태계에서 널리 사용되는 **Plotly**는 단순히 예쁜 그래프를 그려주는 래퍼(Wrapper) 라이브러리가 아닙니다. 수만 개의 데이터를 다루고, 복잡한 3D 차트를 렌더링하며, 사용자의 마우스 움직임에 즉각적으로 반응하는 고성능 '데이터 시각화 엔진'에 가깝습니다.

이 글에서는 Plotly.js가 내부적으로 어떤 아키텍처를 가지고 있는지, 그리고 차트를 생성하는 가장 기본적인 함수인 `Plotly.newPlot()`을 호출했을 때 엔진 내부에서 어떤 일들이 벌어지는지 상세히 파헤쳐 봅니다.

먼저 바닐라 자바스크립트 환경에서 `newPlot`을 사용하는 가장 기본적인 예제를 살펴보겠습니다.

```javascript
const myDiv = document.getElementById("chart-container");
const data = [
  { x: [1, 2, 3], y: [10, 20, 30], type: "scatter", mode: "lines+markers" },
];
const layout = { title: "Plotly 동작 원리" };

// 차트를 생성하는 핵심 진입점
Plotly.newPlot(myDiv, data, layout);
```

우리가 이렇게 newPlot을 호출하면, 엔진은 단순히 전달받은 데이터를 바탕으로 화면에 바로 선을 긋지 않습니다. 내부적으로 입력된 데이터와 레이아웃의 유효성을 검사하고, 기존에 그려진 차트가 있다면 초기화하며, 이벤트 시스템을 준비하는 등 복잡한 전처리 과정을 거칩니다.

이 모든 준비 작업이 마무리되면, Plotly는 실제로 화면에 픽셀을 찍고 레이어를 쌓아 올리는 진짜 렌더링 파이프라인인 `_doPlot` 함수를 내부적으로 호출하게 됩니다.

지금부터 이 `_doPlot` 함수를 중심으로 차트가 완성되는 과정을 따라가 보겠습니다.

---

## 1. 아키텍처: 선언적 API와 하이브리드 렌더링 엔진

Plotly.js의 가장 큰 아키텍처적 특징은 선언적 스키마(Declarative Schema)를 기반으로 작동한다는 점입니다. 개발자는 "선을 어떻게 그려라"라고 명령(Imperative)하는 대신, "이런 데이터와 이런 레이아웃을 원한다"라는 JSON 상태 객체만 전달합니다.

이 JSON 객체를 받아 실제 화면을 그리는 것은 두 개의 강력한 내부 엔진입니다.

- **D3.js (SVG 렌더링):** 막대, 선, 파이 차트 등 일반적인 2D 차트를 담당합니다. DOM(Document Object Model) 요소를 직접 생성하고 관리하므로 스타일링이 자유롭고, 벡터 그래픽 특성상 확대해도 깨지지 않습니다.
- **StackGL (WebGL 렌더링):** 데이터가 수만 개를 넘어가거나 복잡한 3D 표면도(Surface Plot)를 그릴 때 활성화됩니다. CPU 연산과 DOM 조작의 한계를 벗어나 GPU를 직접 활용하여 픽셀을 고속으로 찍어냅니다.

---

## 2. 상태의 완성: `supplyDefaults`와 `_full` 객체

사용자가 넘겨주는 `data`와 `layout` JSON은 대부분 불완전합니다. 축의 범위, 기본 색상, 마진 등이 누락되어 있기 마련입니다. Plotly는 렌더링을 시작하기 전, `supplyDefaults`라는 핵심 전처리 로직을 실행합니다.

이 과정을 거치면 엔진이 실제로 참조하는 완전한 형태의 객체인 `_fullData`와 `_fullLayout`이 생성됩니다.

- **`_fullData`**: 원본 데이터에 계산된 통계치, 내부 식별자(UID), 할당된 기본 색상 등이 모두 포함된 배열입니다.
- **`_fullLayout`**: 캔버스의 최종 픽셀 크기(`width`, `height`), 데이터 좌표를 픽셀로 변환하기 위한 축의 회귀 계수($y = mx + b$), 범례의 위치 등 도화지의 모든 메타데이터를 담고 있습니다.

---

## 3. 렌더링의 심장: `_doPlot` 파이프라인 파헤치기

Plotly.js의 코어에는 실제로 그림을 그리는 명령을 내리는 `_doPlot` 함수가 있습니다. 이 함수는 동기/비동기 로직이 결합된 거대한 파이프라인입니다. 내부적으로 렌더링 과정을 순차적으로 실행하기 위해 함수들의 배열(`seq`)을 만들고 이를 하나씩 실행하는 패턴을 사용합니다.

여기서 모든 함수의 핵심 인자로 전달되는 `gd` (Graph Div)는 단순한 HTML 요소가 아니라, 앞서 만들어진 `_fullData`, `_fullLayout`, 계산된 `calcdata`를 모두 품고 있는 전역 상태 객체입니다.

화면이 그려지는 4가지 주요 페이즈(Phase)는 다음과 같습니다.

### Phase 1: 뼈대 구축과 여백 계산 (Framework & Margins)

가장 먼저 데이터가 놓일 도화지를 만들고, 부가 요소들이 차지할 공간을 확보합니다.

- **`drawFramework(gd)`**
  - **동작:** 캔버스의 기초 공사를 담당합니다. `_fullLayout._basePlotModules`를 순회하며 2D 좌표계(Cartesian), 3D(GL3D), 지도(Geo) 등 활성화된 모듈의 뼈대를 만듭니다. SVG 환경에서는 `<g class="cartesianlayer">` 등을 DOM에 추가하고, WebGL 환경에서는 투명 `<canvas>` 요소를 `gd` 내부에 겹쳐서 배치합니다.
- **`marginPushers(gd)` 및 `marginPushersAgain()`**
  - **동작:** 차트의 제목(Title), 범례(Legend), 축 이름(Tick labels) 등을 임시로 렌더링해 봅니다. 이 요소들이 설정된 캔버스 여백(Margin)을 뚫고 나가는지 계산합니다.
  - **결과:** 잘리는 부분이 있다면 `Plots.doAutoMargin(gd)`을 호출해 `_fullLayout._size`(실제 그래프 내부 영역 크기)를 실시간으로 줄이거나 늘립니다.

### Phase 2: 축과 범위 확정 (Axes & Autorange)

여백이 확정되면 데이터를 뿌리기 위한 스케일(Scale)을 정합니다.

- **`positionAndAutorange(gd)`**
  - **동작:** 축 범위가 `autorange: true`인 경우, `calcdata`의 데이터 최솟값/최댓값을 스캔합니다. 도형(Shapes)이나 주석(Annotations)이 짤리지 않도록 이들의 좌표까지 모두 포함하여 최종적인 축의 시작과 끝을 결정합니다.
- **`drawAxes(gd, 'redraw')`**
  - **동작:** 확정된 범위를 바탕으로 **D3.js**를 강하게 활용합니다. 선형(Linear), 로그(Log) 등 축 타입에 맞춰 눈금(Ticks)의 위치를 계산하고, `<path>` 요소를 생성해 격자선(Grid lines)과 축 선(Zero lines)을 화면에 그립니다.

### Phase 3: 핵심 데이터 렌더링 (The Actual Plotting)

뼈대와 축이 준비되었으니 실제 데이터(선, 막대, 산점도 등)를 화면에 뿌립니다.

- **`subroutines.drawData(gd)`**
  - **동작:** `calcdata`를 순회하며 같은 렌더링 모듈을 사용하는 데이터들을 그룹화합니다.
  - **모듈별 플로팅 함수 호출:** 그룹화가 끝나면 각 모듈의 `plot` 함수를 호출합니다. 예를 들어 산점도의 경우 `Scatter.plot(gd, plotinfo, cdScatter)`가 호출됩니다. 여기서 D3를 이용해 `<path d="...">` 속성을 조작하여 선을 그리거나, WebGL 셰이더로 데이터를 보내 픽셀을 렌더링하도록 분기 처리됩니다.

### Phase 4: 마무리 및 인터랙션 바인딩 (Finalize & Interactions)

그림이 완성된 후, 사용자와 상호작용하기 위한 레이어를 올립니다.

- **`subroutines.finalDraw(gd)`**
  - **동작:** 막대그래프의 텍스트 라벨이나 오차 막대(Error bars) 등 데이터 렌더링이 끝나야만 그릴 수 있는 요소들을 최상단 레이어에 덮어 그립니다.
- **`initInteractions(gd)`**
  - **동작:** 사용자의 마우스/터치 이벤트를 감지할 투명한 드래그 레이어(Drag Layer)를 생성합니다. 줌(Zoom), 팬(Pan) 동작을 위한 이벤트를 바인딩하고, 우측 상단 도구 모음인 **Modebar**를 DOM에 주입합니다.
- **`Plots.rehover(gd)` / `Plots.reselect(gd)`**
  - **동작:** React의 State 업데이트 등으로 차트가 다시 그려진 경우, 사용자가 보고 있던 툴팁(Hover) 상태나 선택 영역(Selection)이 초기화되지 않도록 상태를 복구해 줍니다.

결과적으로 `_doPlot` 파이프라인은 단순히 그림을 그리는 함수가 아니라, "뼈대 잡기 → 여백 밀당하기 → 스케일 맞추기 → 그림 그리기 → 상호작용 입히기"라는 서브루틴들을 철저히 분리하여 지휘하는 마에스트로와 같습니다.

---
