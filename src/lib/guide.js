// "מדריך": step-by-step guides with screenshots (public/guide/). The pictures
// never show real names, amounts, phone numbers or Bit links: those are blurred,
// and the QR code is a demo one.
// spot: the place to tap, in % of the picture (x, y = its center; w, h = its size).

export const BIT_QR_GUIDE = {
  title: 'איך מוצאים את קישור הביט האישי',
  steps: [
    {
      image: 'guide/bit-1.jpg',
      title: 'פותחים את ביט ולוחצים על ״עוד״',
      text: 'הכפתור עם שלוש הנקודות, ליד ״הוספה״.',
      spot: { x: 15.5, y: 32, w: 22, h: 11 },
    },
    {
      image: 'guide/bit-2.jpg',
      title: 'בוחרים ״קוד ה־QR הקבוע שלי לקבלת כסף״',
      text: 'האפשרות האחרונה ברשימה.',
      spot: { x: 58.5, y: 91.6, w: 74, h: 6 },
    },
    {
      image: 'guide/bit-3.jpg',
      title: 'מצלמים מסך של הקוד',
      text: 'לוחצים יחד על הכפתור בצד ועל הגברת עוצמה. חוזרים לכאן, לוחצים ״📷 בחר צילום מסך של קוד ה־QR בביט״ ובוחרים את הצילום. הקישור נקרא בטלפון שלך, והתמונה לא נשלחת לשום מקום.',
      spot: { x: 50, y: 69.8, w: 40, h: 19.5 },
    },
  ],
};
