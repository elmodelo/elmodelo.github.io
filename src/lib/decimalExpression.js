// Parse arithmetic without executing JavaScript. Rational BigInt arithmetic keeps
// terminating decimals exact; repeating results round to 20 decimal places.
export function evaluateAssetExpression(expression) {
  const text = expression.trim();
  if (!text || text.length > 4096) throw new Error('invalid');
  if (/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(text)) {
    if (!Number.isFinite(Number(text))) throw new Error('invalid');
    return text;
  }
  const gcd = (a, b) => {
    a = a < 0n ? -a : a;
    while (b) [a, b] = [b, a % b];
    return a;
  };
  const rational = (n, d = 1n) => {
    if (!d) throw new Error('invalid');
    if (d < 0n) { n = -n; d = -d; }
    const factor = gcd(n, d);
    return { n: n / factor, d: d / factor };
  };
  let position = 0;
  let steps = 0;
  const skip = () => { while (/\s/.test(text[position] ?? '') && position < text.length) position++; };
  const take = (token) => {
    skip();
    if (text[position] !== token) return false;
    position++;
    return true;
  };
  const primary = (depth) => {
    if (++steps > 512 || depth > 32) throw new Error('invalid');
    skip();
    if (take('+')) return primary(depth + 1);
    if (take('-')) {
      const value = primary(depth + 1);
      return { n: -value.n, d: value.d };
    }
    if (take('(')) {
      const value = sum(depth + 1);
      if (!take(')')) throw new Error('invalid');
      return value;
    }
    const match = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)/.exec(text.slice(position));
    if (!match) throw new Error('invalid');
    position += match[0].length;
    const [whole, fraction = ''] = match[0].split('.');
    return rational(BigInt((whole || '0') + fraction), 10n ** BigInt(fraction.length));
  };
  const product = (depth) => {
    let left = primary(depth);
    for (;;) {
      if (take('*')) {
        const right = primary(depth);
        left = rational(left.n * right.n, left.d * right.d);
      } else if (take('/')) {
        const right = primary(depth);
        left = rational(left.n * right.d, left.d * right.n);
      } else return left;
    }
  };
  const sum = (depth) => {
    let left = product(depth);
    for (;;) {
      if (take('+')) {
        const right = product(depth);
        left = rational(left.n * right.d + right.n * left.d, left.d * right.d);
      } else if (take('-')) {
        const right = product(depth);
        left = rational(left.n * right.d - right.n * left.d, left.d * right.d);
      } else return left;
    }
  };
  const { n, d } = sum(0);
  skip();
  if (position !== text.length || n < 0n) throw new Error('invalid');
  let remainder = d;
  let twos = 0;
  let fives = 0;
  while (remainder % 2n === 0n) { remainder /= 2n; twos++; }
  while (remainder % 5n === 0n) { remainder /= 5n; fives++; }
  const places = remainder === 1n ? Math.max(twos, fives) : 20;
  if (places > 4096) throw new Error('invalid');
  const scaled = n * 10n ** BigInt(places);
  const rounded = scaled / d + (2n * (scaled % d) >= d ? 1n : 0n);
  const digits = rounded.toString().padStart(places + 1, '0');
  const result = places ? (digits.slice(0, -places) + '.' + digits.slice(-places)).replace(/\.?0+$/, '') : digits;
  if (!Number.isFinite(Number(result))) throw new Error('invalid');
  return result;
}
