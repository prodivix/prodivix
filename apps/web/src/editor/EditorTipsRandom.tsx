import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TIPS, type TipId } from './tips';

export function EditorTipsRandom() {
  const { t } = useTranslation('editor');
  const tipsCount = TIPS.length;
  const [scores, setScores] = useState(() => Array(tipsCount).fill(1));
  const [active, setActive] = useState(0);

  const pickNextTip = useCallback(() => {
    const weights = scores.map((score) => 1 / score);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * total;
    let next = 0;
    for (let index = 0; index < tipsCount; index++) {
      if (random < weights[index]) {
        next = index;
        break;
      }
      random -= weights[index];
    }
    if (next === active && tipsCount > 1) next = (active + 1) % tipsCount;
    setScores((prev) => {
      const clone = [...prev];
      clone[next] += 1;
      return clone;
    });
    setActive(next);
  }, [scores, active, tipsCount]);

  useEffect(() => {
    const timer = setInterval(pickNextTip, 5000);
    return () => clearInterval(timer);
  }, [pickNextTip]);

  const clickNext = () => pickNextTip();
  const tipId = TIPS[active] as TipId;

  return (
    <div
      className="mt-auto cursor-pointer p-[12px] text-center text-(length:--font-size-md) text-(--text-muted) select-none hover:text-(--text-primary)"
      onClick={clickNext}
    >
      <p>
        {t('tips.prefix')} {t(`tips.items.${tipId}.body`)}
      </p>
    </div>
  );
}
