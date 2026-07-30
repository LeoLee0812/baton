// Reciprocal Rank Fusion：把多路召回结果按名次融合成一个排序。
// 公式 score(d) = Σ 1/(k + rank_i(d))，k=60 是业界常用默认值。
//
// SQL 侧（bt_hybrid_search）也实现了一份同样的公式；这里的 JS 版本用于
// /api/ask 里合并「自己的检索结果」与「跨人检索结果」。

export const RRF_K = 60;

export interface FusedItem<T> {
  key: string;
  item: T;
  score: number;
}

/**
 * @param lists 多路结果，每一路都已按各自的相关性降序排好
 * @param keyOf 取唯一键，用于跨路去重
 */
export function rrfFuse<T>(lists: T[][], keyOf: (item: T) => string): FusedItem<T>[] {
  const acc = new Map<string, FusedItem<T>>();

  for (const list of lists) {
    list.forEach((item, i) => {
      const key = keyOf(item);
      const rank = i + 1;
      const inc = 1 / (RRF_K + rank);
      const cur = acc.get(key);
      if (cur) {
        cur.score += inc;
      } else {
        // 保留首次出现的原始对象，避免后一路的同名条目覆盖掉信息更全的那份
        acc.set(key, { key, item, score: inc });
      }
    });
  }

  return Array.from(acc.values()).sort((a, b) => b.score - a.score);
}
