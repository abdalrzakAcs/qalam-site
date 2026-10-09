// ═══════════════════════════════════════════════════════════════
// منصة «مدرستي» — عامل الخدمة (Service Worker)
// السياسة:
//   • طلبات Supabase (البيانات والجلسات): تمرير نظيف للشبكة دائماً —
//     لا تُخزَّن أبداً، فهي بيانات حسّاسة ومرتبطة بجلسة المستخدم.
//   • تنقّل الصفحات (index.html): الشبكة أولاً كي تصل التحديثات فوراً،
//     ومع انقطاع الاتصال تُقدَّم النسخة المخزنة ليفتح التطبيق المثبّت.
//   • الأصول الثابتة (سكربتات، أنماط، خطوط، أيقونات): التخزين أولاً —
//     أسماء ملفات Vite مبصومة بالمحتوى فلا خطر من نسخة قديمة.
// عند تغيير هذه السياسة ارفع رقم النسخة ليُحذف التخزين القديم.
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'qalam-static-v3';
const SUPABASE_HOST = 'uwqijcfjdwkpefijdowv.supabase.co';

// جذر التطبيق مشتق من موقع عامل الخدمة نفسه — يعمل على النطاق الجذر
// وتحت مسار فرعي (GitHub Pages) على السواء
const BASE = new URL('./', self.location).pathname;

// الأساسيات التي تُخزَّن مسبقاً عند التثبيت ليعمل الفتح دون اتصال
const PRECACHE = [
  BASE,
  BASE + 'manifest.webmanifest',
  BASE + 'favicon.svg',
  BASE + 'icons/icon.svg',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
];

// التثبيت: تخزين الأساسيات ثم التفعيل دون انتظار إغلاق التبويبات
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// التفعيل: حذف نسخ التخزين القديمة والسيطرة على التبويبات المفتوحة.
// نحذف تخزين قلم وحده — الأصل قد يكون مشتركاً مع مواقع أخرى (مثل github.io)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('qalam-') && k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // طلبات Supabase: لا نعترضها إطلاقاً — تمرير نظيف للشبكة
  // (اعتراضها أو تخزينها يعبث بالجلسات ويخزن بيانات خاصة على جهاز مشترك)
  if (url.hostname === SUPABASE_HOST) return;

  // لا نتدخل إلا بطلبات GET من أصل التطبيق نفسه
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // ملف APK (~٥٣ ميغا) يمر للشبكة مباشرة: نقر رابط التنزيل طلب تنقّل،
  // فلو مرّ بالفرع التالي لصار هو «الصفحة» المخزنة التي يفتحها التطبيق دون اتصال
  if (url.pathname.startsWith(BASE + 'download/')) return;

  // تنقّل الصفحات: الشبكة أولاً، وعند الانقطاع النسخة المخزنة.
  // لا نخزّن إلا صفحة HTML سليمة من الأصل نفسه — لا تحويلاً ولا صورة فُتحت مباشرة
  // ولا صفحة خطأ من الخادم. المسارات العميقة تصل برمز 404 من GitHub Pages لكن
  // محتواها index.html نفسه، فتُقبل.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const type = res.headers.get('content-type') || '';
          if (res.type === 'basic' && (res.ok || res.status === 404) && type.includes('text/html')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(BASE, copy));
          }
          return res;
        })
        .catch(() => caches.match(BASE))
    );
    return;
  }

  // الأصول الثابتة: التخزين أولاً، وعند الغياب جلب من الشبكة ثم تخزين
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // نخزّن الاستجابات السليمة فقط (لا أخطاء ولا استجابات جزئية)
        if (res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
