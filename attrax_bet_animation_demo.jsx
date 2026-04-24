import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";


function AxLogo({ size = 42 }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-full border-2 border-white bg-black shadow-[0_0_24px_rgba(255,255,255,0.18)]"
      style={{ width: size, height: size }}
    >
      <div className="absolute h-[38%] w-[38%] rotate-45 rounded-[35%] bg-white" />
      <div className="absolute top-[18%] left-[20%] h-[22%] w-[28%] rounded-sm bg-white" />
      <div className="absolute top-[18%] right-[20%] h-[22%] w-[28%] rounded-sm bg-white" />
      <div className="absolute bottom-[18%] left-[20%] h-[22%] w-[28%] rounded-sm bg-white" />
      <div className="absolute bottom-[18%] right-[20%] h-[22%] w-[28%] rounded-sm bg-white" />
    </div>
  );
}

function FlyingCoin({ id, delay, side }) {
  const startX = side === "yes" ? -80 : 80;
  const endX = side === "yes" ? -260 : 260;
  const peak = -90 - Math.random() * 70;
  const drift = (Math.random() - 0.5) * 120;
  return (
    <motion.div
      className="absolute left-1/2 top-[72%] z-40"
      initial={{ x: startX, y: 0, opacity: 0, scale: 0.55, rotate: 0 }}
      animate={{
        x: [startX, drift, endX],
        y: [0, peak, -210],
        opacity: [0, 1, 1, 0],
        scale: [0.55, 0.95, 0.75],
        rotate: [0, 180, 420],
      }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9, delay, ease: "easeOut" }}
    >
      <AxLogo size={34} />
    </motion.div>
  );
}

function OddsBar({ yes }) {
  const no = 100 - yes;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-zinc-400">
        <span>Market Odds</span>
        <span className="flex items-center gap-1">⚡ Live</span>
      </div>
      <div className="h-12 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-1">
        <div className="flex h-full gap-1">
          <motion.div
            className="flex items-center justify-start rounded-xl bg-white px-4 text-black font-black"
            animate={{ width: `${yes}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 18 }}
          >
            YES {yes}%
          </motion.div>
          <motion.div
            className="flex items-center justify-end rounded-xl bg-zinc-700 px-4 text-white font-black"
            animate={{ width: `${no}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 18 }}
          >
            NO {no}%
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default function AttraxBetAnimationDemo() {
  const [yes, setYes] = useState(52);
  const [balance, setBalance] = useState(1250);
  const [coins, setCoins] = useState([]);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState(null);
  const [combo, setCombo] = useState(0);
  const [botBet, setBotBet] = useState(false);

  const coinBurst = (side) => {
    const now = Date.now();
    setCoins(Array.from({ length: 9 }, (_, i) => ({ id: `${now}-${i}`, delay: i * 0.035, side })));
    setTimeout(() => setCoins([]), 1500);
  };

  const bet = (side) => {
    coinBurst(side);
    setFlash(true);
    setCombo((c) => c + 1);
    setBalance((b) => Math.max(0, b - 50));
    setToast(side === "yes" ? "+50 AX on YES" : "+50 AX on NO");
    setYes((v) => {
      const next = side === "yes" ? Math.min(91, v + 5) : Math.max(9, v - 5);
      return next;
    });
    setTimeout(() => setFlash(false), 450);
    setTimeout(() => setToast(null), 1300);

    setTimeout(() => {
      setBotBet(true);
      setYes((v) => Math.min(91, v + 2));
      setTimeout(() => setBotBet(false), 1800);
    }, 950);
  };

  const rank = useMemo(() => Math.max(1, 18 - Math.floor(combo / 2)), [combo]);

  return (
    <div className="min-h-screen bg-[#090909] text-white p-6 md:p-10 overflow-hidden">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <AxLogo size={58} />
            <div>
              <h1 className="text-4xl font-black tracking-tight">AttraX Market</h1>
              <p className="text-zinc-400">Forum + virtual odds + AX Coin motion demo</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-right">
            <div className="text-xs uppercase tracking-widest text-zinc-500">Balance</div>
            <motion.div key={balance} initial={{ scale: 1.18 }} animate={{ scale: 1 }} className="text-2xl font-black">{balance} AX</motion.div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <Card className="relative overflow-hidden rounded-[2rem] border-white/10 bg-[#111] shadow-2xl">
            <CardContent className="p-8">
              <AnimatePresence>
                {coins.map((c) => <FlyingCoin key={c.id} {...c} />)}
              </AnimatePresence>

              <AnimatePresence>
                {toast && (
                  <motion.div
                    className="absolute left-1/2 top-8 z-50 -translate-x-1/2 rounded-full border border-white/15 bg-white px-5 py-2 font-black text-black shadow-[0_0_40px_rgba(255,255,255,0.35)]"
                    initial={{ opacity: 0, y: -20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.8 }}
                  >
                    ⚡ Big Bet Detected · {toast}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div animate={flash ? { x: [0, -8, 8, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.35 }}>
                <div className="mb-7 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-transparent p-6">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="mb-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-black">HOT MARKET</div>
                      <h2 className="text-3xl font-black leading-tight">Will any demo crash on stage?</h2>
                      <p className="mt-2 text-zinc-400">下注后金币飞入奖池，赔率条实时变化。</p>
                    </div>
                    <motion.div animate={flash ? { scale: [1, 1.25, 1] } : { scale: 1 }} className="hidden md:block">
                      <AxLogo size={86} />
                    </motion.div>
                  </div>

                  <OddsBar yes={yes} />

                  <div className="mt-7 grid grid-cols-2 gap-4">
                    <Button onClick={() => bet("yes")} className="h-16 rounded-2xl bg-white text-lg font-black text-black hover:bg-zinc-200 active:scale-95">Bet YES · 50 AX</Button>
                    <Button onClick={() => bet("no")} className="h-16 rounded-2xl bg-zinc-800 text-lg font-black text-white hover:bg-zinc-700 active:scale-95">Bet NO · 50 AX</Button>
                  </div>
                </div>
              </motion.div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 text-xl">📈</div>
                  <div className="text-sm text-zinc-400">Volume</div>
                  <div className="text-2xl font-black">8,420 AX</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 text-xl">🏆</div>
                  <div className="text-sm text-zinc-400">Your Rank</div>
                  <motion.div key={rank} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-2xl font-black">#{rank}</motion.div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 text-xl">⚡</div>
                  <div className="text-sm text-zinc-400">Combo</div>
                  <motion.div key={combo} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="text-2xl font-black">🔥 x{combo}</motion.div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-[2rem] border-white/10 bg-[#111]">
              <CardContent className="p-6">
                <h3 className="mb-4 text-xl font-black">Live Feed</h3>
                <div className="space-y-3">
                  <AnimatePresence>
                    {botBet && (
                      <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                        <div className="flex items-center gap-3 font-black">🤖 AI_Bot_23</div>
                        <p className="mt-1 text-sm text-zinc-300">just followed your bet: +120 AX on YES</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <b>@hacker_mason</b>
                    <p className="mt-1 text-sm text-zinc-400">“这个市场有内幕味了。”</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <b>@demo_reaper</b>
                    <p className="mt-1 text-sm text-zinc-400">“Stage demo crash is inevitable.”</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-white/10 bg-[#111]">
              <CardContent className="p-6">
                <h3 className="mb-4 text-xl font-black">Animation Notes</h3>
                <div className="space-y-3 text-sm text-zinc-300">
                  <p>1. 点击下注：按钮缩放，产生触发感。</p>
                  <p>2. AX Coin 从按钮喷出，沿弧线飞入市场池。</p>
                  <p>3. 落点触发震动、闪光、赔率条弹性变化。</p>
                  <p>4. AI 用户跟投，制造“市场活着”的感觉。</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
