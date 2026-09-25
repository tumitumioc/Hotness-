import React from 'react';
import { X, Share, PlusSquare, Smartphone, ArrowDown, CheckCircle2 } from 'lucide-react';

interface PwaInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall: () => void;
  isIos: boolean;
  isStandalone: boolean;
}

export const PwaInstallModal: React.FC<PwaInstallModalProps> = ({
  isOpen,
  onClose,
  onInstall,
  isIos,
  isStandalone,
}) => {
  if (!isOpen || isStandalone) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 relative overflow-hidden animate-in slide-in-from-bottom-6 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Gradient Line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 via-rose-500 to-amber-500" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header with App Logo & Title */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-rose-600 p-0.5 shadow-lg shadow-red-500/20 shrink-0">
            <img 
              src="/logo.fevicon.png" 
              alt="Hotness Logo" 
              className="w-full h-full object-cover rounded-[14px]"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Hotness Streaming</h3>
              <CheckCircle2 className="w-4 h-4 text-red-600 fill-red-50" />
            </div>
            <p className="text-xs text-slate-500 font-medium">অফিসিয়াল ওয়েব অ্যাপ (Android & iOS)</p>
          </div>
        </div>

        {/* Dynamic Content for Android vs iOS */}
        {isIos ? (
          <div className="space-y-3.5">
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              iPhone বা iPad-এ ইনস্টল করে অ্যাপের মতো ফুল-স্ক্রিন এক্সপেরিয়েন্স পেতে নিচের ৩টি সহজ ধাপ অনুসরণ করুন:
            </p>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
              <div className="flex items-center gap-3 text-xs text-slate-700 font-semibold">
                <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs shrink-0">
                  ১
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  সাফারি ব্রাউজারের নিচের <Share className="w-4 h-4 text-blue-500 inline" /> <strong>Share</strong> বাটনে চাপ দিন।
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-700 font-semibold">
                <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs shrink-0">
                  ২
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  নিচে স্ক্রোল করে <PlusSquare className="w-4 h-4 text-slate-800 inline" /> <strong>Add to Home Screen</strong> সিলেক্ট করুন।
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-700 font-semibold">
                <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs shrink-0">
                  ৩
                </span>
                <span>
                  উপরে ডানপাশে <strong>Add</strong> বাটনে ক্লিক করলেই অ্যাপটি হোমস্ক্রিনে চলে আসবে!
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black tracking-wider transition-all shadow-md cursor-pointer"
            >
              বুঝেছি (GOT IT)
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              কোনো প্রকার APK ডাউনলোড বা স্টোরেজের ঝামেলা ছাড়াই আপনার ফোনে ইনস্টল করুন। 
              এটি সাধারণ অ্যাপের মতোই সুপারফাস্ট এবং কোনো এক্সট্রা মেমোরি খরচ করে না।
            </p>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-medium">
              <div className="flex items-center gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-100">
                <span className="text-emerald-500">⚡</span>
                <span>লাইটেনিং ফাস্ট স্পিড</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-100">
                <span className="text-red-500">🔥</span>
                <span>ফুল-স্ক্রিন মোড</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-100">
                <span className="text-amber-500">📱</span>
                <span>হোম স্ক্রিন আইকন</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-100">
                <span className="text-blue-500">🛡️</span>
                <span>১০০% নিরাপদ ও সুরক্ষিত</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={onInstall}
                className="flex-[2] py-3 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-600 hover:from-red-700 hover:to-rose-700 text-white text-xs font-black tracking-wider shadow-lg shadow-red-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                <span>Install app</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
