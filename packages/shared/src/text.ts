// ตัด char ที่ท้าย (และหัว ถ้า side = 'both') ของข้อความ — ใช้แทน regex /x+$/ ที่ backtrack แบบ O(n²)
export const trimChar = (value: string, char: string, side: 'both' | 'end' = 'both'): string => {
    let from = 0;
    let to = value.length;
    if (side === 'both') while (from < to && value[from] === char) from++;
    while (to > from && value[to - 1] === char) to--;
    return value.slice(from, to);
};
