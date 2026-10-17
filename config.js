/* الدُّرّ المكنون · إعدادات عامة غير سرّية
   لا تضعي أي مفتاح API أو سرّ في هذا الملف لأنه يُحمّل في المتصفح.
   بعد نشر خدمة quran-asr-service ضعي رابطها فقط في quranAsr.url.
*/
window.DURR_CONFIG = Object.assign({}, window.DURR_CONFIG || {}, {
  quranAsr: {
    url: "https://quran-asr-production-3419.up.railway.app",
    mode: "quran-specialized-streaming",
    model: "Quran-Lab/zipformer_p-arabic-v3"
  }
});
