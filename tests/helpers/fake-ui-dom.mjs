export class FakeElement {
  constructor({
    id = "",
    className = "",
    dataset = {},
    value = "",
    textContent = "",
    hidden = false,
    tagName = "div"
  } = {}) {
    this.id = id;
    this.className = className;
    this.dataset = { ...dataset };
    this.value = value;
    this.textContent = textContent;
    this.hidden = hidden;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.innerHTML = "";
    this.attributes = new Map();
  }

  append(...nodes) {
    nodes.flat().forEach((node) => {
      if (!node) return;
      node.parentNode = this;
      this.children.push(node);
    });
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  dispatchEvent(event) {
    const payload = {
      preventDefault() {},
      target: this,
      currentTarget: this,
      ...event
    };
    const handlers = this.listeners.get(payload.type) || [];
    handlers.forEach((handler) => handler(payload));
    return true;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
    if (name === "hidden") this.hidden = true;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "hidden") this.hidden = false;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  matches(selector) {
    return selector.split(",").some((part) => matchSelector(this, part.trim()));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    traverse(this, (node) => {
      if (node !== this && node.matches(selector)) results.push(node);
    });
    return results;
  }
}

export function createFakeDocument() {
  return {
    createElement(tagName) {
      return new FakeElement({ tagName });
    }
  };
}

function traverse(node, visit) {
  node.children.forEach((child) => {
    visit(child);
    traverse(child, visit);
  });
}

function matchSelector(node, selector) {
  if (!selector) return false;
  if (selector.includes(":not(")) {
    const [base, rest] = selector.split(":not(");
    const negative = rest.slice(0, -1);
    return matchSelector(node, base) && !matchSelector(node, negative);
  }
  if (selector.includes(" > ")) {
    const [parent, child] = selector.split(/\s*>\s*/);
    return matchSelector(node, child) && Boolean(node.parentNode?.matches(parent));
  }
  if (selector.includes(" ")) {
    const parts = selector.split(/\s+/);
    const last = parts.pop();
    if (!matchSelector(node, last)) return false;
    let current = node.parentNode;
    while (parts.length && current) {
      if (current.matches(parts[parts.length - 1])) parts.pop();
      current = current.parentNode;
    }
    return parts.length === 0;
  }
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  if (selector.startsWith(".")) return node.className.split(/\s+/).includes(selector.slice(1));
  if (selector.startsWith("[")) return matchDataSelector(node, selector);
  return node.tagName.toLowerCase() === selector.toLowerCase();
}

function matchDataSelector(node, selector) {
  const match = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if (!match) return false;
  const [, rawName, expected] = match;
  const name = rawName
    .replace(/^data-/, "")
    .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  if (!(name in node.dataset)) return false;
  return expected === undefined || node.dataset[name] === expected;
}
