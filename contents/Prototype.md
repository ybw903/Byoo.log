---
title: "프로토타입이란?"
date: "2025-06-02"
tags: ["javascript"]
summary: "프로토타입은 자바스크립트에서 객체의 상속관계를 표현하기 위해 사용되는 객체입니다."
---

프로토타입은 자바스크립트에서 객체의 상속관계를 표현하기 위해 사용되는 객체입니다.

자바스크립트에서 객체들은 모두 프로토타입을 가지고 `__proto__` 접근자를 통해서, 자신의 프로토타입 객체에 접근할 수 있습니다.

이 때, 특정 객체의 프로토타입 객체에 바로 접근하는 공식적인 방법은 없습니다.

> Javascript 언어 표준 스펙에서[[prototype]]으로 표현되는 프로토타입 객체에 대한 "링크"는 내부 속성으로 정의되어 있습니다. (ECMAScript 참조).

## 프로토타입과 함수

이러한 프로토타입은 객체를 생성하기 위한, 생성자 함수와 연결되어 있고, 함수가 생성되는 시점에 더불어 생성됩니다.

이 때, 생성자 함수의 prototype 프로퍼티를 통해, 생성자 함수로부터 생성할 객체의 프로퍼티와 메서드를 상속하도록 해줄 수 있습니다.

```js
function Person(name) {
  this.name = name;
}

Person.prototype.sayHi = function () {
  console.log(`Hi, my name is ${this.name}.`);
};

const jack = new Person("jack");
jack.sayHi(); // Hi, my name is jack
```

## 프로토타입 체인

앞에서 살펴본 코드에서 jack은 `sayHi` 메서드 외에도 `hasOwnProperty` 같은 다른 메서드도 호출할 수 있습니다.

이 때, 프로토타입에 정의되지 않은 `hasOwnProperty` 메서드를 jack 객체에서 어떻게 호출 할 수 있을까요?

이유는 `Person.prototype` 또한 프로토타입을 가지며, `Person.prototype`의 프로토타입은 `Object.prototype`이기 때문에 `Object.prototype`이 가지는 `hasOwnProperty` 메서드를 호출 할 수 있게 됩니다.

이처럼 자바스크립트의 객체가 프로퍼티,메서드에 접근하려고 할 떄, 해당 객체에 접근하려는 프로퍼티가 없다면, [[prototype]] 참조를 따라 자신의 부모 역할을 하는 프로토타입의 프로퍼티를 순차적으로 검색하게 되고 이를 **프로토 타입 체인**이라고 합니다.

## 오바라이딩, 프로퍼티 섀도잉

만약 아래 코드와 같이 jack 인스턴스에 동일한 이름을 가진 `sayHi` 메서드가 추가가 되었습니다.

```js
function Person(name) {
  this.name = name;
}

Person.prototype.sayHi = function () {
  console.log(`Hi, my name is ${this.name}.`);
};

const jack = new Person("jack");
jack.sayHi = function () {
  console.log(`${this.name} says hello`);
};
jack.sayHi(); // jack says hello
```

이 때, 기존에 추가된 프로토타입의 메서드 대신, jack 인스턴스에 추가된 `sayHi` 메서드가 호출되게 됩니다.

이를 가리켜, jack 인스턴스에 추가된 `sayHi` 메서드가 프로토타입의 `sayHi` 메서드를 오버라이딩 했다고 합니다.

이처럼 프로토타입 체인 상 동일한 이름의 식별자가 존재할 때, 프로토타입의 식별자가 가려지는 현상을 프로퍼티 섀도잉이라고 합니다.
