---
title: "dnd-kit/core에서 dnd-kit/react로 마이그레이션하기"
date: "2026-07-19"
tags: ["dnd-kit", "React", "Performance"]
summary: "칸반 보드의 드래그앤드롭 성능 문제를 해결하기 위해 dnd-kit/core에서 dnd-kit/react로 마이그레이션한 경험을 공유합니다."
---

# dnd-kit/core에서 dnd-kit/react로 마이그레이션하기

칸반 보드 형태의 UI를 만들 때 드래그앤드롭은 핵심 인터랙션입니다. 카드 하나를 옮기는 단순한 동작처럼 보이지만, 컬럼 간 이동, 그룹 이동, 인디케이터 표시 등 다양한 시나리오를 매끄럽게 처리하려면 **렌더링 성능**이 받쳐줘야 합니다.

이 글에서는 실제 프로덕트에서 `@dnd-kit/core` 기반으로 구현된 칸반 보드의 리렌더링 폭증 문제를 살펴봅니다. 다양한 최적화 시도와, 최종적으로 `@dnd-kit/react`로 마이그레이션한 과정을 정리합니다.

보드의 구조는 다음과 같습니다.

- **컬럼**: 여러 개의 컬럼이 가로로 나열됩니다. 각 컬럼은 `DroppableColumn`으로 구성됩니다.
- **컬럼 내부 아이템**: 개별 카드(`DraggableCard`)와 여러 카드를 하나로 묶은 그룹(`GroupWrapper`)이 존재합니다.
- **주요 동작**: 카드 단일 이동, 다중 선택 이동, 그룹 통째 이동, 컬럼 간 이동, 정렬 위치 변경.

---

## 1. 문제 발견: 드래그 중 리렌더링 폭증

기존 구현은 `@dnd-kit/core`의 `DndContext` 기반이었습니다. 컬럼마다 `SortableContext`를 두고, 각 카드/그룹에 `useSortable`을 걸어놓는 흔한 구조입니다.

문제는 드래그가 시작되는 순간부터 발생합니다. **React DevTools Profiler**로 측정하면, 마우스를 조금만 움직여도 컬럼과 카드 컴포넌트들이 매 프레임 리렌더링됩니다. 특히 컬럼 수가 늘고 컬럼 안 카드 수가 많아질수록, 여러 카드가 묶인 **그룹을 통째로 다른 컬럼으로 옮길 때** 미세한 프레임 드랍이 발생합니다.

원인은 `@dnd-kit/core`의 동작 방식 자체에 있습니다. 드래그 중 변화하는 좌표·충돌 상태·활성 아이템 정보 등이 모두 **React state**로 관리되므로, 드래그 이벤트마다 `DndContext` 컨텍스트가 갱신됩니다. 이를 구독하는 모든 컴포넌트가 리렌더링되는 구조입니다. `useSortable`/`useDroppable`이 내부에서 컨텍스트를 구독하는 만큼, 트리 안의 카드가 많아질수록 리렌더 비용이 선형적으로 늘어납니다.

---

## 2. dnd-kit/core에서의 최적화 시도

마이그레이션을 결정하기 전, 기존 환경에서 할 수 있는 최적화를 먼저 시도했습니다.

### 컨텍스트 구독 지점 격리

첫 번째로 시도한 것은 **`useDndContext` 구독 지점을 한 컴포넌트로 격리**하는 것입니다. 여러 자식이 각자 `useDndContext`를 호출해 `active`/`over`를 읽으면, 컨텍스트가 갱신될 때마다 각 자식이 독립적으로 리렌더링됩니다.

`DndContext` 바로 아래에 `BoardDndBody`라는 얇은 컴포넌트를 두고, 이 컴포넌트에서만 `useDndContext`를 구독한 뒤 필요한 정보를 props로 내려주는 방식으로 바꿨습니다.

```typescript
// DndContext 내부에서 useDndContext 단일 구독
const BoardDndBody: FC<Props> = ({ columnModels, itemList, ... }) => {
  const { active, over } = useDndContext();
  const overId = (over?.id as string | undefined) ?? null;
  const dndActiveId = (active?.id as string | undefined) ?? null;
  const isBoardDragging = active !== null;

  const overColumnIdx = useMemo(
    () => getColumnIdxForDndOverId(overId, itemList),
    [overId, itemList]
  );

  return (
    <div className='flex ...'>
      {columnModels.map(column => (
        <BoardColumn
          key={column.id}
          column={column}
          // 숫자 대신 boolean으로 좁혀 memo가 리렌더를 차단하도록 유도
          isOverThisColumn={overColumnIdx === column.columnIdx}
          dndActiveId={dndActiveId}
          isBoardDragging={isBoardDragging}
        />
      ))}
    </div>
  );
};
```

이 때 주목할 부분은 `isOverThisColumn: boolean`입니다. `overColumnIdx: number`를 그대로 내려주면 컬럼이 자기 위에 없더라도 값이 바뀔 때마다 props가 바뀌므로 `memo`가 통과되지 않습니다. **자기 컬럼 위인지 아닌지**를 boolean으로 좁히면, 관계없는 컬럼의 props가 바뀌지 않으므로 `memo`가 통과될 수 있습니다.

다만 실제 결과는 기대만큼은 아니었습니다. 컬럼 컴포넌트 자체의 함수 실행은 줄었지만, 내부의 `DraggableMatch`/`GroupWrapper`가 `useSortable`을 통해 `DndContext`를 각자 구독하고 있어, 컬럼 subtree의 훅들은 여전히 매 프레임 리렌더됩니다. `memo`는 부모의 재호출만 막아줄 뿐, **자식이 컨텍스트를 직접 구독하는 경우의 리렌더는 막지 못합니다.**

### 무거운 서브트리 memoization

컬럼(`BoardColumn`) 전체를 `memo`로 감싸고, 컬럼 내부의 아이템 목록 JSX(`listBody`)를 `useMemo`로 캐싱했습니다.

```typescript
const listBody = useMemo(() => {
  // renderItem은 콜백 안에서 정의된 로컬 함수.
  // 각 아이템 타입(hidden / group / card)에 맞는 JSX를 반환한다.
  const renderItem = (item, itemIndex) => {
    /* ... hidden / group / card 분기 ... */
  };

  return (
    <div className='flex w-full min-w-0 flex-col gap-4 pr-0.5'>
      {groupedRenderItems.map((item, itemIndex) => renderItem(item, itemIndex))}
    </div>
  );
}, [/* renderItem이 클로저로 참조하는 값 + groupedRenderItems */]);
```

컨텍스트 구독으로 컬럼이 리렌더되더라도, deps가 그대로면 React가 이전 가상 DOM 참조를 재사용해 **자식 트리 재조정**을 건너뜁니다. 카드 컴포넌트에도 `memo`를 걸고, 자식에게 전달되는 콜백/객체 props를 `useCallback`/`useMemo`로 안정화했습니다.

이 작업 후 단순한 카드 이동 시나리오에서는 프레임 드랍 없이 부드러운 인터랙션이 가능해졌습니다. 다만 **그룹 단위 이동**에서는 여전히 미세한 끊김이 남습니다. `useSortable` 자체가 `DndContext`를 구독하므로, 행마다 드래그 중 리렌더는 남을 수밖에 없습니다. memoization은 자식 트리 재조정 비용은 없애주지만, **컨텍스트 구독 → 훅 리렌더 → 컴포넌트 함수 실행** 자체를 없애지는 못합니다.

### 인디케이터 방식 + 커스텀 충돌 알고리즘

리렌더를 더 줄이기 위해, 드래그 오버 시점에 실제 배열을 재정렬하지 않고 **인디케이터만 표시**하는 방식으로 변경했습니다. `onDragOver`에서 리스트를 재계산하면 그 자체가 대규모 리렌더의 원인이 됩니다. 인디케이터 위치만 표시하고, 드롭이 일어난 순간에만 정렬을 반영합니다.

여기서 새로운 문제가 발생합니다. `@dnd-kit/core`의 기본 충돌 알고리즘(`closestCenter`, `rectIntersection`)을 사용하면, 인디케이터가 두 카드 사이의 어느 쪽에 더 가까운지에 따라 드롭 시 정렬 위치가 갈립니다. **인디케이터 UI는 어떤 카드의 위쪽에 표시되지만, 실제 드롭 위치는 충돌 알고리즘의 판단에 따라 위/아래가 갈리는 현상**입니다.

이 불일치를 없애기 위해, 포인터가 카드의 위쪽 절반에 있을 때만 "이 카드 앞에 삽입"으로 판정하는 커스텀 충돌 알고리즘 `beforeOnlyCollision`을 작성했습니다.

```typescript
export const beforeOnlyCollision: CollisionDetection = ({
  collisionRect,
  droppableRects,
  droppableContainers,
  pointerCoordinates,
}) => {
  // 드래그 중심 X가 대상 사각형의 수평 범위 안에 있는 컨테이너만 필터링
  const dragCenterX = collisionRect.left + collisionRect.width / 2;
  const horizontallyOverlapping = [...droppableContainers].filter(container => {
    const rect = droppableRects.get(container.id);
    if (!rect) return false;
    return dragCenterX >= rect.left && dragCenterX <= rect.right;
  });

  // column-* 컨테이너(DroppableColumn)는 제외 — 아이템만 판정
  const itemContainers = horizontallyOverlapping.filter(
    c => !String(c.id).startsWith('column-')
  );

  // 실제 커서 Y 기준으로 판정 (drag center 대신 pointer 사용)
  const pointerY = pointerCoordinates?.y ?? collisionRect.top + collisionRect.height / 2;

  return resolveItemCollisions(itemContainers, droppableRects, pointerY);
};

function resolveItemCollisions(containers, droppableRects, pointerY) {
  const withRects = containers
    .map(c => ({ container: c, rect: droppableRects.get(c.id) }))
    .filter(x => x.rect != null)
    .sort((a, b) => a.rect.top - b.rect.top);

  // 커서가 midY 이하인 첫 번째 아이템 → 그 앞(before)에 삽입
  for (const { container, rect } of withRects) {
    const midY = rect.top + rect.height / 2;
    if (pointerY <= midY) {
      return [{ id: container.id, data: { isAfter: false } }];
    }
  }

  // 커서가 모든 아이템의 midY 아래 → 마지막 아이템 뒤(after)에 삽입
  const last = withRects[withRects.length - 1];
  return [{ id: last.container.id, data: { isAfter: true } }];
}
```

핵심은 세 가지입니다.

- **판정 기준을 pointerY로 통일**: 드래그 중심 좌표가 아닌 실제 커서 위치로 판정해야, 사용자가 카드의 어느 위치를 잡든 인디케이터가 커서 주변에서 정확하게 이동합니다.
- **컬럼 컨테이너 제외**: 아이템끼리의 상대 위치로 삽입 지점을 정하기 위해 컬럼 자체 드롭영역은 판정에서 제외했습니다. 빈 컬럼 등 예외는 별도 경로로 처리합니다.
- **fallback 명시**: 모든 아이템의 midY 아래에 커서가 있으면 마지막 아이템 뒤에 삽입한다는 `isAfter: true` 정보를 함께 반환합니다.

이 작업으로 인디케이터와 실제 드롭 동작의 일관성은 확보했습니다. 하지만 컬럼 수와 카드 수가 함께 늘어난 상황에서 **그룹을 다른 컬럼으로 옮길 때의 미세한 프레임 드랍**은 여전히 남아 있었습니다.

---

## 3. 한계와 마이그레이션 결정

여러 최적화를 거치며 얻은 결론은 다음과 같습니다.

> 렌더링 폭증은 사용 방식의 문제가 아니라, 라이브러리의 상태 관리 모델 자체에서 비롯됩니다.

`@dnd-kit/core`는 드래그 상태를 **React state**로 관리하며, 이 상태 변경이 컨텍스트를 통해 트리 전체로 전파됩니다. `useSortable`/`useDroppable`이 내부에서 이 컨텍스트를 구독하므로, 컴포넌트 트리가 커질수록 **드래그 이벤트 한 번당 훅 실행 횟수와 컴포넌트 함수 호출 횟수**가 선형적으로 늘어납니다. memoization은 자식 트리 재조정 비용을 줄여줄 뿐, 훅 자체의 실행을 없애지는 못합니다.

마침 `@dnd-kit`은 새로운 아키텍처 기반의 `@dnd-kit/react` 패키지를 발표한 상태였고, 이 패키지가 **상태 기반이 아닌 명령형 DOM 업데이트**로 드래그 중 React 리렌더를 최소화한다는 점을 확인했습니다. 마이그레이션을 결정한 주요 근거입니다.

---

## 4. dnd-kit/core와 dnd-kit/react의 아키텍처 차이

### 패키지 구조의 변화

`@dnd-kit/core`는 React에 강하게 결합된 단일 패키지였습니다. 새로운 `@dnd-kit`은 **레이어드 아키텍처**로 재설계되었습니다.

- `@dnd-kit/abstract`: 프레임워크에 독립적인 코어. 플러그인 시스템, 모니터, 드래그 오퍼레이션, 충돌 감지 인터페이스 등 추상화 계층.
- `@dnd-kit/dom`: DOM 환경 구현 레이어. 센서, 모디파이어, 실제 DOM 조작 로직.
- `@dnd-kit/react`: React 어댑터. `useDraggable`, `useDroppable`, `useSortable`, `DragDropProvider` 등 React 친화 API.

이 구조 덕분에 동일한 코어 로직을 Vue, Svelte, Solid 등 다른 프레임워크에서도 재사용할 수 있습니다.

### 렌더링 모델의 변화

가장 큰 변화는 **드래그 상태가 더 이상 React state로 관리되지 않는다**는 점입니다.

`@dnd-kit/core`의 `useSortable`은 `transform`, `listeners`, `setNodeRef` 등을 반환합니다. 드래그 중 좌표가 `transform` state를 통해 컴포넌트로 다시 흘러들어옵니다. 매 프레임마다 React 렌더링 사이클이 한 번씩 돌아야 합니다.

```typescript
// @dnd-kit/core
const { attributes, listeners, setNodeRef, transform, isDragging, isOver } = useSortable({ id });

const style = {
  transform: CSS.Translate.toString(transform),
  opacity: isDragging ? 0.5 : 1,
};

return <div ref={setNodeRef} style={style} {...listeners} {...attributes} />;
```

반면 `@dnd-kit/react`의 `useSortable`은 **ref만 반환**합니다. 드래그 중 좌표 업데이트는 내부 `Draggable` 클래스가 직접 DOM 노드의 `transform`을 갱신합니다. React state를 거치지 않으므로 **드래그 중에는 리렌더가 발생하지 않습니다**.

```typescript
// @dnd-kit/react
const { ref, handleRef, isDragging, isDropTarget } = useSortable({
  id,
  index: sortableIndex,
  transition: null,
  plugins: [],
  collisionDetector: beforeOnlyCollisionDetector,
});

return <div ref={ref}>{/* 드래그 중에도 리렌더 없음 */}</div>;
```

내부적으로는 `@dnd-kit/abstract`의 **reactive effect 시스템**과 `Monitor` 기반 옵저버 패턴이 이를 조율합니다. 드래그 상태 변경은 옵저버를 통해 필요한 곳에만 전달되며, DOM 업데이트는 React를 우회해 직접 이루어집니다.

### API의 변화

마이그레이션에서 신경 써야 하는 주요 변경사항은 다음과 같습니다.

| @dnd-kit/core | @dnd-kit/react |
| --- | --- |
| `DndContext` | `DragDropProvider` |
| `useDndContext` → `{ active, over }` | `useDragOperation` → `{ source, target }` |
| `useDraggable/useSortable` → `{ transform, listeners, setNodeRef }` | `useDraggable/useSortable` → `{ ref, handleRef, isDragging, isDropTarget }` |
| `useDroppable` → `{ setNodeRef, isOver }` | `useDroppable` → `{ ref, isDropTarget }` |
| `SortableContext` + `strategy` | 별도 컨텍스트 없음 — `useSortable`이 `index`를 직접 받음 |
| `DndContext`에 `collisionDetection` 전역 지정 | droppable마다 `collisionDetector` 지정 + `CollisionPriority`로 계층 우선순위 |
| `onDragOver` 등 이벤트 콜백 | `onCollision` 이벤트로 충돌 판정 결과 훅업 가능 |
| `useSensor(PointerSensor, { activationConstraint })` | `PointerSensor.configure({ activationConstraints: [new PointerActivationConstraints.Distance({ value: 8 })] })` |

ref 기반으로 바뀌면서 `listeners` spread나 `transform` 직접 주입 같은 코드가 사라집니다. 컴포넌트의 책임이 "드래그 상태를 받아 스타일을 만든다"에서 "DOM 노드만 라이브러리에 넘긴다"로 바뀝니다.

---

## 5. 실제 마이그레이션 작업

### Provider와 센서

`DndContext`를 `DragDropProvider`로 교체하고, 센서는 컴포넌트 바깥에 **정적 배열로 정의**합니다. 이렇게 하면 렌더마다 새 배열을 만들지 않아도 됩니다.

```typescript
// Before (@dnd-kit/core)
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
);

<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragStart={onDragStart}
  onDragEnd={onDragEnd}
  onDragCancel={onDragCancel}
>
  ...
</DndContext>
```

```typescript
// After (@dnd-kit/react)
const sensors = [
  PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 8 })],
  }),
];

<DragDropProvider
  sensors={sensors}
  onDragStart={onDragStart}
  onDragEnd={onDragEnd}
  onCollision={handleCollision}
>
  ...
</DragDropProvider>
```

전역 `collisionDetection` prop이 사라진 점이 중요합니다. 충돌 감지는 이제 **각 droppable에 붙는 개별 함수**가 되었고, `onCollision`으로 최종 충돌 목록을 훅업할 수 있습니다.

### 컨텍스트 구독

`useDndContext()` → `useDragOperation()`으로 바뀌면서, 필드 이름도 `active`/`over` → `source`/`target`으로 변경됩니다.

```typescript
// Before
const { active, over } = useDndContext();
const overId = (over?.id as string | undefined) ?? null;
const isBoardDragging = active !== null;

// After
const { source, target } = useDragOperation();
const overId = target?.id != null ? String(target.id) : null;
const isBoardDragging = source != null;
```

### Sortable / Droppable

카드 쪽 훅 사용 코드가 상당히 얇아집니다. `SortableContext`가 사라지고, `useSortable`이 `index`를 직접 받는 방식으로 바뀝니다.

```typescript
// Before
<SortableContext items={columnItemIds} strategy={noTransformStrategy}>
  {/* ... */}
</SortableContext>

const { attributes, listeners, setNodeRef, isDragging, isOver } = useSortable({ id });
return <div ref={setNodeRef} {...listeners} {...attributes}>...</div>;
```

```typescript
// After
// SortableContext 감싸기 자체가 필요 없음

const { ref, handleRef, isDragging, isDropTarget } = useSortable({
  id,
  index: sortableIndex,
  transition: null,   // React state로 이동하는 transition 비활성화
  plugins: [],        // 필요 없는 플러그인 제거
  collisionDetector: beforeOnlyCollisionDetector,
});

return (
  <div ref={ref}>
    <div ref={handleRef}>{/* drag handle */}</div>
    {/* card body */}
  </div>
);
```

- `transition: null`로 두면 라이브러리가 이동 애니메이션을 위해 스타일을 계속 갱신하지 않습니다. 인디케이터 방식이므로 실제 재정렬은 드롭 시점에만 발생하면 됩니다.
- `plugins: []`로 기본 플러그인을 비활성화해, UX와 상관없는 자동 스크롤/모디파이어 등을 제거합니다.
- `handleRef`가 새로 생겼습니다. 카드 본문 전체가 아닌 **드래그 핸들 영역만** 이 ref를 받도록 하면, 카드 안의 인터랙티브 요소(셀렉트, 버튼 등)와 드래그 트리거가 겹치지 않게 정리할 수 있습니다.

`useDroppable`도 얇아집니다.

```typescript
// Before
const { setNodeRef, isOver } = useDroppable({ id });

// After
const { ref, isDropTarget } = useDroppable({
  id,
  collisionDetector: columnCollisionDetector,
});
```

### 제거된 코드들

마이그레이션 결과, 다음 코드들이 제거되었습니다.

- **`noTransformStrategy`**: sortable의 transform 기반 자동 이동을 무력화하기 위해 만들었던 커스텀 strategy. `transition: null` 옵션으로 대체됩니다.
- **컬럼별 `columnItemIds` memo**: 다른 컬럼에서 드래그 중인 아이템을 sortable items에 임시로 append해 컨텍스트 인식을 유도하던 워크어라운드. 컨텍스트/렌더링 모델 자체가 바뀌면서 불필요해졌습니다.
- **컬럼 컴포넌트의 여러 memo props**: 컨텍스트 구독이 리렌더로 이어지지 않으므로, `isOverThisColumn` 같은 프롭도 원래 목적(memo 통과)이 희미해집니다.

---

## 6. 커스텀 충돌 알고리즘 재작성

`@dnd-kit/react`의 충돌 감지는 시그니처와 사고 모델이 완전히 다릅니다. 기존에는 **하나의 `CollisionDetection` 함수가 모든 droppable을 훑어 배열을 반환**했다면, 이제는 **droppable마다 `CollisionDetector` 함수를 붙이고, 각 함수가 `Collision | null` 하나를 반환**합니다. 결과는 라이브러리가 `priority`와 `value`로 정렬해 최종 target을 결정합니다.

```typescript
import { CollisionPriority, CollisionType } from '@dnd-kit/abstract';
import type { CollisionDetector } from '@dnd-kit/abstract';

// 카드 / 그룹 헤더 전용 충돌
export const beforeOnlyCollisionDetector: CollisionDetector = ({ droppable, dragOperation }) => {
  const rect = droppable.shape?.boundingRectangle;
  if (!rect) return null;

  const pointerX = dragOperation.position.current.x;
  if (pointerX < rect.left || pointerX > rect.right) return null;

  const pointerY = dragOperation.position.current.y;
  const midY = rect.top + rect.height / 2;

  // sortCollisions는 value 내림차순 정렬 → 가까울수록 큰 값이 되게 1/(dist+1) 사용
  if (pointerY <= midY) {
    return {
      id: droppable.id,
      priority: CollisionPriority.High,      // 위쪽 절반(before): 최우선
      type: CollisionType.PointerIntersection,
      value: 1 / (midY - pointerY + 1),
      data: { isAfter: false },
    };
  }

  return {
    id: droppable.id,
    priority: CollisionPriority.Normal,      // 아래쪽 절반(after): fallback
    type: CollisionType.PointerIntersection,
    value: 1 / (pointerY - midY + 1),
    data: { isAfter: true },
  };
};

// 컬럼 전용 충돌
export const columnCollisionDetector: CollisionDetector = ({ droppable, dragOperation }) => {
  const rect = droppable.shape?.boundingRectangle;
  if (!rect) return null;

  const { x: pointerX, y: pointerY } = dragOperation.position.current;
  if (pointerX < rect.left || pointerX > rect.right) return null;
  if (pointerY < rect.top  || pointerY > rect.bottom) return null;

  const midY = rect.top + rect.height / 2;
  return {
    id: droppable.id,
    priority: CollisionPriority.Low,         // 카드가 있으면 카드가 항상 이김
    type: CollisionType.PointerIntersection,
    value: 1 / (Math.abs(pointerY - midY) + 1),
    data: { isAfter: pointerY > midY },
  };
};
```

기존 알고리즘 대비 좋아진 점은 다음과 같습니다.

- **droppable마다 판정 로직 국소화**: "카드 판정용 로직"과 "컬럼 판정용 로직"을 분리할 수 있습니다. 기존에는 하나의 함수 안에서 `String(id).startsWith('column-')`로 분기하는 방식이었습니다.
- **`CollisionPriority`로 계층 표현**: 카드가 있는 위치에서는 카드가 이기고, 카드 밖(패딩·헤더·하단 여백)에서는 컬럼 자체가 target이 됩니다. 이 계층 덕분에 컬럼 하단 빈 공간으로 드래그했을 때 "이 컬럼 끝에 추가" 케이스를 자연스럽게 처리할 수 있습니다.
- **`data`로 UX 힌트 전달**: `isAfter` 플래그를 컬리전 데이터에 실어 보내면, `onCollision`에서 캡처해 드롭 처리 로직에 활용할 수 있습니다.

```typescript
// 컬리전 결과를 훅업해서 드롭 시 사용
const isAfterRef = useRef(false);
const handleCollision: CollisionEvent = useCallback((event) => {
  isAfterRef.current = event.collisions[0]?.data?.isAfter ?? false;
  lastCollisionsRef.current = event.collisions;
}, []);
```

---

## 7. 마이그레이션 결과 및 회고

### 실측: React Profiler로 리렌더 카운트 비교

체감상의 개선을 숫자로 확인하기 위해, 마이그레이션 전(`@dnd-kit/core`) 커밋과 마이그레이션 후(`@dnd-kit/react`) 커밋 각각에서 동일한 시나리오를 반복 측정했습니다.

- **측정 도구**: React `<Profiler>` API. 보드 최상위(`Board`)와 각 컬럼(`Column-*`)을 감싸 `onRender` 콜백에서 `{ id, phase, actualDuration }`을 배열에 누적합니다.
- **드래그 시뮬레이션**: Playwright에서 `pointerdown` → `pointermove` × N(스텝당 16ms) → `pointerup`을 dispatch합니다. dnd-kit이 실제 사용자 조작으로 인식하도록 `PointerSensor`의 8px activation constraint를 넘기는 프라임 이동을 먼저 넣습니다.
- **데이터**: 6개 컬럼, 컬럼당 100~140개 카드가 있는 실제 대회 데이터를 로드한 상태입니다.
- **시나리오 3종**: (S1) 같은 컬럼 안에서 4칸 아래로 카드 이동, (S2) 옆 컬럼으로 카드 이동, (S3) 그룹 통째 다른 컬럼으로 이동.

세 시나리오 모두에서 결과가 뚜렷합니다.

| 시나리오 | 총 커밋 수 | Board 커밋 수 | 소스 컬럼 커밋 수 |
| --- | --- | --- | --- |
| S1 · 같은 컬럼 내 이동 | **275 → 107** (−61%) | **41 → 26** (−37%) | **39 → 11** (−72%) |
| S2 · 다른 컬럼으로 이동 | **311 → 56** (−82%) | **46 → 8** (−83%) | **45 → 8** (−82%) |
| S3 · 그룹 통째 이동 | **331 → 77** (−77%) | **48 → 11** (−77%) | **47 → 11** (−77%) |

Board가 소비한 총 렌더 시간(actualDuration 합)도 비슷한 흐름입니다.

| 시나리오 | Board 총 렌더 시간 | 소스 컬럼 총 렌더 시간 |
| --- | --- | --- |
| S1 | **431 ms → 254 ms** (−41%) | 61 ms → 115 ms* |
| S2 | **635 ms → 312 ms** (−51%) | **205 ms → 99 ms** (−52%) |
| S3 | **572 ms → 155 ms** (−73%) | **129 ms → 44 ms** (−66%) |

*S1의 소스 컬럼만 유일하게 총 시간이 올라간 것처럼 보입니다. 커밋 횟수 자체는 39 → 11로 크게 줄었지만, 남은 커밋 하나가 드롭 직후 정렬 반영이라 상대적으로 무거운 값을 갖기 때문입니다. **"매 프레임 얇게 리렌더"에서 "드롭 순간 한 번만 진짜 반영"으로 바뀐 패턴**을 그대로 보여주는 지표입니다.

가장 눈에 띄는 지표는 **관계없는 컬럼도 매번 리렌더되던 현상이 사라진다**는 부분입니다. `@dnd-kit/core`에서는 6개 컬럼이 매 pointermove마다 40회 넘게 커밋됩니다. `@dnd-kit/react`로 옮긴 뒤에는 소스/타깃 컬럼조차 10회 안팎으로 줄었으며, 그마저도 대부분은 드래그 시작/종료 시점의 상태 변경에서 발생합니다. 드래그 중간의 이동은 라이브러리가 DOM `transform`을 직접 갱신해 React를 통과하지 않습니다.

### 그 외 개선점

- 그룹 단위 이동, 컬럼 간 이동에서 발생하던 미세한 프레임 드랍이 사라졌습니다.
- `useCallback`/`useMemo`로 방어하던 코드 일부가 불필요해졌습니다. 컨텍스트 구독이 리렌더로 이어지지 않으므로, `isOverThisColumn` 같은 boolean 좁히기 트릭도 원래 이유(memo 통과)를 잃습니다. 물론 자연스러운 최적화는 남겨두는 편이 좋습니다.
- 커스텀 충돌 로직이 오히려 **더 깨끗해졌습니다**. 하나의 큰 함수 안에서 분기하지 않고, droppable별로 얇은 함수를 두고 `CollisionPriority`로 조율할 수 있기 때문입니다.

### 유의사항

- 커스텀 충돌 함수는 시그니처와 반환 형태가 완전히 달라 **전면 재작성**이 필요합니다.
- `handleRef` 도입에 따라 카드 내부 인터랙티브 요소(셀렉트, 버튼 등)의 이벤트 처리를 정리해야 합니다. 드래그 핸들 안에 인터랙티브 요소가 섞여 있는 경우, 클릭 이벤트가 드래그 시작으로 이어지지 않도록 native 이벤트 처리를 별도 훅으로 추출하는 후속 리팩터링이 필요합니다.
- 마이그레이션 이후에도 인디케이터·정렬 계산과 관련한 회귀를 여러 커밋에 걸쳐 다듬어야 했는데, 이는 패키지 문제가 아니라 새 API를 충분히 파악하지 못한 상태에서 코드를 옮긴 탓이 컸습니다. `CollisionDetector`의 `priority`/`value` 계산 규칙, `useSortable`의 `index`가 정렬에 관여하는 방식, `onCollision`으로 캡처되는 데이터의 시점 등을 문서와 실제 동작을 함께 확인하며 적응하는 시간이 필요했습니다.

### 정리

이번 마이그레이션을 통해 **최적화의 한계는 라이브러리의 설계 모델이 결정한다**는 점을 확인할 수 있었습니다. memoization은 리렌더 비용을 줄여주는 도구이지만, 상태 기반 모델 위에서는 **훅 자체의 실행**이라는 근본 비용을 없앨 수 없습니다. `@dnd-kit/react`처럼 React state를 우회해 DOM을 직접 갱신하는 설계는 드래그앤드롭 같은 **고빈도 인터랙션**에 적합한 접근입니다.

복잡한 드래그앤드롭이 필요한 프로젝트라면, 처음부터 `@dnd-kit/react` 도입을 고려해볼 수 있습니다.
