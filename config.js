/* الدُّرّ المكنون · إعدادات عامة غير سرّية
   لا تضعي أي مفتاح API أو سرّ في هذا الملف لأنه يُحمّل في المتصفح.
   بعد نشر خدمة quran-asr-service ضعي رابطها فقط في quranAsr.url.
*/
window.DURR_CONFIG = Object.assign({}, window.DURR_CONFIG || {}, {
  quranAsr: {
    url: "",
    mode: "quran-specialized-streaming",
    model: "mohammed/fastconformer-quran-ar-onnx-int8"
  }
});
