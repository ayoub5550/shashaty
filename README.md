# شاشتي · Shashaty

تطبيق ويب عربي خفيف لاستكشاف **الأفلام والمسلسلات**: الرائج، في السينما، الأعلى تقييمًا، تفاصيل كاملة بالعربية،
إعلانات يوتيوب، طاقم التمثيل، المواسم والحلقات، أين تُشاهَد (منصات قانونية)، وقائمة «للمشاهدة لاحقًا».

- Node.js فقط (بدون أُطر عمل وبدون تبعيات) — نفس فلسفة dzmanga.
- البيانات من [TMDB](https://www.themoviedb.org/) عبر الـAPI الرسمي.

## التشغيل

```bash
TMDB_API_KEY=xxxxx PORT=3091 npm start
```

## البنية
- `src/server.js` — خادم HTTP + وكيل TMDB مع تخزين مؤقت في الذاكرة + وكيل صور.
- `src/public/` — الواجهة (HTML/CSS/JS عادي، RTL).

> This product uses the TMDB API but is not endorsed or certified by TMDB.
