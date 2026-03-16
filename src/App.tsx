import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Target, Flame, Utensils, History, ChevronRight, X, Sparkles, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from "@google/genai";

/**
 * Utility for tailwind class merging
 */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface FoodItem {
  id: string;
  name: string;
  calories: number;
  timestamp: number;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [goal, setGoal] = useState(2000);
  const [water, setWater] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const [smartInput, setSmartInput] = useState('');
  const [isSmartAdding, setIsSmartAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCalories, setNewCalories] = useState('');
  const [showGoalEdit, setShowGoalEdit] = useState(false);
  const [isAiEstimating, setIsAiEstimating] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [alertSent, setAlertSent] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Debounced AI estimation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (newName.trim() && !newCalories && isAdding) {
        estimateCalories();
      }
    }, 1000); // 1 second delay after typing stops

    return () => clearTimeout(timer);
  }, [newName, isAdding]);

  // Load data from localStorage
  useEffect(() => {
    const savedItems = localStorage.getItem('calorie_items');
    const savedGoal = localStorage.getItem('calorie_goal');
    const savedWater = localStorage.getItem('calorie_water');
    
    const today = new Date().setHours(0, 0, 0, 0);

    if (savedItems) {
      const parsed = JSON.parse(savedItems);
      setItems(parsed.filter((item: FoodItem) => item.timestamp >= today));
    }
    if (savedGoal) setGoal(parseInt(savedGoal));
    if (savedWater) {
      const parsedWater = JSON.parse(savedWater);
      if (parsedWater.date === today) setWater(parsedWater.amount);
    }
    
    const savedPhone = localStorage.getItem('calorie_phone');
    if (savedPhone) setPhoneNumber(savedPhone);
    
    const lastAlertDate = localStorage.getItem('calorie_last_alert');
    if (lastAlertDate === today.toString()) setAlertSent(true);
  }, []);

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem('calorie_items', JSON.stringify(items));
    localStorage.setItem('calorie_goal', goal.toString());
    localStorage.setItem('calorie_phone', phoneNumber);
    localStorage.setItem('calorie_water', JSON.stringify({
      date: new Date().setHours(0, 0, 0, 0),
      amount: water
    }));
  }, [items, goal, water, phoneNumber]);

  const totalCalories = useMemo(() => 
    items.reduce((sum, item) => sum + item.calories, 0)
  , [items]);

  // Alert Logic
  useEffect(() => {
    const today = new Date().setHours(0, 0, 0, 0).toString();
    if (totalCalories >= 600 && !alertSent && phoneNumber) {
      const sendAlert = async () => {
        try {
          const response = await fetch('/api/send-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber, calories: totalCalories }),
          });
          if (response.ok) {
            setAlertSent(true);
            localStorage.setItem('calorie_last_alert', today);
          }
        } catch (error) {
          console.error("Failed to send SMS alert:", error);
        }
      };
      sendAlert();
    }
    
    // Reset alert if calories drop below 600 (though unlikely in a day log)
    if (totalCalories < 600 && alertSent) {
      setAlertSent(false);
      localStorage.removeItem('calorie_last_alert');
    }
  }, [totalCalories, alertSent, phoneNumber]);

  const remaining = Math.max(0, goal - totalCalories);

  // Mock macros based on total calories (40/30/30 split)
  const macros = useMemo(() => ({
    protein: Math.round((totalCalories * 0.3) / 4),
    carbs: Math.round((totalCalories * 0.4) / 4),
    fat: Math.round((totalCalories * 0.3) / 9),
  }), [totalCalories]);

  const estimateCalories = async () => {
    if (!newName.trim()) return;
    
    setIsAiEstimating(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Estimate the calories for this food/drink: "${newName}". Return ONLY the number of calories as an integer. If you are unsure, provide a reasonable average for a standard serving.`,
      });
      
      const text = response.text;
      const calories = parseInt(text.replace(/[^0-9]/g, ''));
      if (!isNaN(calories)) {
        setNewCalories(calories.toString());
      }
    } catch (error) {
      console.error("AI Estimation failed:", error);
    } finally {
      setIsAiEstimating(false);
    }
  };

  const addItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newCalories) return;

    const newItem: FoodItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: newName || 'Quick Entry',
      calories: parseInt(newCalories),
      timestamp: Date.now(),
    };

    setItems([newItem, ...items]);
    setNewName('');
    setNewCalories('');
    setIsAdding(false);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleSmartAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smartInput.trim() || isSmartAdding) return;

    setIsSmartAdding(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a calorie estimation expert. Parse the user's input into a list of food items with their estimated calorie counts.
Input: "${smartInput}"
Return a JSON array of objects, each with 'name' (string) and 'calories' (integer).
Example: '2 slices of pizza and a salad' -> [{"name": "2 slices of pizza", "calories": 600}, {"name": "Salad", "calories": 150}]
Return ONLY the JSON array.`,
      });

      const text = response.text;
      const jsonMatch = text.match(/\[.*\]/s);
      if (jsonMatch) {
        const parsedItems = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsedItems)) {
          const newFoodItems: FoodItem[] = parsedItems.map(item => ({
            id: Math.random().toString(36).substr(2, 9),
            name: item.name || 'Unknown Item',
            calories: parseInt(item.calories) || 0,
            timestamp: Date.now(),
          }));
          setItems(prev => [...newFoodItems, ...prev]);
          setSmartInput('');
        }
      }
    } catch (error) {
      console.error("Smart Add failed:", error);
    } finally {
      setIsSmartAdding(false);
    }
  };

  const chartData = [
    { name: 'Consumed', value: totalCalories },
    { name: 'Remaining', value: remaining },
  ];

  const trendData = [
    { day: 'M', val: 1800 },
    { day: 'T', val: 2100 },
    { day: 'W', val: 1950 },
    { day: 'T', val: 2200 },
    { day: 'F', val: 1700 },
    { day: 'S', val: 2400 },
    { day: 'S', val: totalCalories },
  ];

  const COLORS = ['#10b981', 'rgba(255, 255, 255, 0.05)'];

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500/30 relative overflow-hidden pb-20">
      {/* Cinematic Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-float" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-900/10 blur-[150px] rounded-full animate-float-delayed" />
      </div>

      {/* Header */}
      <header className="relative z-10 p-6 flex justify-between items-center border-b border-white/5 backdrop-blur-md bg-black/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 glass-panel rounded-xl flex items-center justify-center neon-glow">
            <Flame className="text-emerald-500" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tighter flex items-center gap-2">
              CALORIE<span className="text-emerald-500">FLOW</span>
            </h1>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold">System Active</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowSettings(true)}
            className="w-10 h-10 glass-panel hover:bg-white/5 rounded-xl flex items-center justify-center transition-all"
          >
            <Sparkles size={16} className={cn(phoneNumber ? "text-emerald-500" : "text-zinc-600")} />
          </button>
          <button 
            onClick={() => setShowGoalEdit(true)}
            className="flex items-center gap-2 glass-panel hover:bg-white/5 px-4 py-2 rounded-full transition-all group"
          >
            <Target size={14} className="text-emerald-500 group-hover:rotate-90 transition-transform" />
            <span className="text-xs font-mono tracking-wider">{goal} KCAL</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-md mx-auto p-6 space-y-10">
        {/* Progress Section - HUD Style */}
        <section className="relative aspect-square max-w-[300px] mx-auto group">
          <div className="absolute inset-0 border border-emerald-500/10 rounded-full animate-pulse" />
          <div className="absolute inset-4 border border-emerald-500/5 rounded-full" />
          
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius="82%"
                outerRadius="95%"
                paddingAngle={0}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[index % COLORS.length]} 
                    className={index === 0 ? "drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" : ""}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-[10px] text-emerald-500/50 font-mono tracking-[0.3em] mb-1 uppercase">Consumption</div>
            <motion.span 
              key={totalCalories}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-6xl font-bold tracking-tighter font-mono"
            >
              {totalCalories}
            </motion.span>
            <div className="mt-4 flex flex-col items-center">
              <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent mb-3" />
              <span className={cn(
                "text-xs font-mono tracking-widest uppercase",
                remaining > 0 ? "text-emerald-500/70" : "text-rose-500/70"
              )}>
                {remaining > 0 ? `+${remaining} Delta` : `${remaining} Limit`}
              </span>
            </div>
          </div>

          {/* HUD Corner Accents */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-emerald-500/30 rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-emerald-500/30 rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-emerald-500/30 rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-emerald-500/30 rounded-br-lg" />
        </section>

        {/* Macros HUD */}
        <section className="grid grid-cols-3 gap-4">
          {[
            { label: 'Protein', val: macros.protein, unit: 'g', color: 'bg-emerald-500' },
            { label: 'Carbs', val: macros.carbs, unit: 'g', color: 'bg-blue-500' },
            { label: 'Fats', val: macros.fat, unit: 'g', color: 'bg-amber-500' },
          ].map((macro) => (
            <div key={macro.label} className="glass-panel p-4 rounded-2xl relative overflow-hidden group">
              <div className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest mb-2">{macro.label}</div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold font-mono">{macro.val}</span>
                <span className="text-[8px] text-zinc-600 uppercase">{macro.unit}</span>
              </div>
              <div className="mt-2 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '60%' }}
                  className={cn("h-full rounded-full", macro.color)}
                />
              </div>
            </div>
          ))}
        </section>

        {/* Hydration & Trend Row */}
        <section className="grid grid-cols-2 gap-4">
          {/* Hydration */}
          <div className="glass-panel p-5 rounded-[32px] relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Hydration</div>
                <div className="text-2xl font-bold font-mono mt-1">{water}<span className="text-[10px] text-zinc-600 ml-1">OZ</span></div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Plus size={14} className="text-blue-500" />
              </div>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <button
                  key={i}
                  onClick={() => setWater(prev => Math.min(128, prev + 8))}
                  className={cn(
                    "flex-1 h-8 rounded-md transition-all",
                    water >= i * 8 ? "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" : "bg-white/5 hover:bg-white/10"
                  )}
                />
              ))}
            </div>
          </div>

          {/* Weekly Trend Sparkline */}
          <div className="glass-panel p-5 rounded-[32px] relative overflow-hidden">
            <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Weekly Trend</div>
            <div className="h-16 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  {/* Using a simple bar-like visualization for the trend since we already have recharts */}
                  <Pie
                    data={trendData}
                    cx="50%"
                    cy="50%"
                    innerRadius="0%"
                    outerRadius="0%"
                    dataKey="val"
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Custom Sparkline implementation */}
              <div className="flex items-end justify-between h-full gap-1">
                {trendData.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: `${(d.val / 2500) * 100}%` }}
                      className={cn(
                        "w-full rounded-t-sm transition-colors",
                        i === 6 ? "bg-emerald-500" : "bg-zinc-800"
                      )}
                    />
                    <span className="text-[8px] font-mono text-zinc-600">{d.day}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="grid grid-cols-4 gap-3">
          {[100, 200, 500, 800].map((val) => (
            <motion.button
              key={val}
              whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setNewCalories(val.toString());
                setNewName(`Quick Entry`);
                setIsAdding(true);
              }}
              className="glass-panel p-4 rounded-2xl text-center transition-all relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/5 transition-colors" />
              <span className="text-[10px] font-mono text-zinc-500 block mb-1">+{val}</span>
              <Plus size={12} className="mx-auto text-emerald-500/50" />
            </motion.button>
          ))}
        </section>

        {/* List Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500 flex items-center gap-3">
              <div className="w-1 h-4 bg-emerald-500" />
              Activity Log
            </h2>
            <button 
              onClick={() => setIsAdding(true)}
              className="w-10 h-10 glass-panel text-emerald-500 rounded-xl hover:scale-110 transition-all flex items-center justify-center neon-glow"
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Smart Add Input */}
          <form onSubmit={handleSmartAdd} className="relative group">
            <div className="absolute inset-0 bg-emerald-500/5 blur-xl rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <div className="relative glass-panel rounded-2xl p-1 flex items-center gap-2 border-white/5 group-focus-within:border-emerald-500/30 transition-all">
              <div className="pl-4 text-emerald-500/50">
                {isSmartAdding ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              </div>
              <input
                type="text"
                placeholder="Smart Add: '2 eggs and avocado toast'..."
                value={smartInput}
                onChange={(e) => setSmartInput(e.target.value)}
                disabled={isSmartAdding}
                className="flex-1 bg-transparent border-none py-4 px-2 text-sm font-mono focus:outline-none placeholder:text-zinc-700"
              />
              <button
                type="submit"
                disabled={!smartInput.trim() || isSmartAdding}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-0"
              >
                Sync
              </button>
            </div>
          </form>

          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {items.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-16 glass-panel rounded-[32px] border-dashed border-white/5"
                >
                  <Utensils className="mx-auto text-zinc-800 mb-4 opacity-20" size={40} />
                  <p className="text-zinc-600 text-[10px] font-mono tracking-widest uppercase">No Data Synchronized</p>
                </motion.div>
              ) : (
                items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 20, opacity: 0 }}
                    className="group glass-panel p-5 rounded-2xl flex items-center justify-between hover:border-emerald-500/30 transition-all"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center justify-center">
                        <Utensils size={20} className="text-emerald-500/70" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm tracking-tight">{item.name}</h3>
                        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <span className="font-mono font-bold text-lg text-emerald-400">{item.calories}</span>
                        <span className="text-[8px] font-mono text-zinc-600 block uppercase">Units</span>
                      </div>
                      <button 
                        onClick={() => removeItem(item.id)}
                        className="p-2 text-zinc-700 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* Add Item Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="relative w-full max-w-md glass-panel rounded-[40px] p-10 shadow-2xl border-white/10"
            >
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h2 className="text-2xl font-bold tracking-tighter">NEW ENTRY</h2>
                  <p className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase mt-1">Input Data Stream</p>
                </div>
                <button onClick={() => setIsAdding(false)} className="w-10 h-10 glass-panel rounded-full flex items-center justify-center">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={addItem} className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em]">Designation</label>
                  <div className="relative">
                    <input 
                      autoFocus
                      type="text"
                      placeholder="IDENTIFY FOOD SOURCE"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 pr-14 focus:outline-none focus:border-emerald-500/50 transition-all font-mono text-sm placeholder:text-zinc-700"
                    />
                    <button
                      type="button"
                      onClick={estimateCalories}
                      disabled={isAiEstimating || !newName.trim()}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition-all disabled:opacity-30"
                    >
                      {isAiEstimating ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em]">Energy Value</label>
                  <input 
                    type="number"
                    placeholder="0000"
                    value={newCalories}
                    onChange={(e) => setNewCalories(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 focus:outline-none focus:border-emerald-500/50 transition-all font-mono text-4xl text-emerald-500 placeholder:text-emerald-900/30"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-emerald-500 text-black font-black p-5 rounded-2xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                >
                  Confirm Entry
                  <ChevronRight size={20} />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Goal Edit Modal */}
      <AnimatePresence>
        {showGoalEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGoalEdit(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-xs glass-panel rounded-[40px] p-10 shadow-2xl border-white/10"
            >
              <h2 className="text-xl font-bold mb-2 text-center tracking-tighter">TARGET LIMIT</h2>
              <p className="text-[10px] font-mono text-zinc-500 text-center tracking-widest uppercase mb-8">Adjust Parameters</p>
              <div className="space-y-6">
                <input 
                  type="number"
                  value={goal}
                  onChange={(e) => setGoal(parseInt(e.target.value) || 0)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-center text-4xl font-mono font-bold text-emerald-500 focus:outline-none focus:border-emerald-500/50"
                />
                <button 
                  onClick={() => setShowGoalEdit(false)}
                  className="w-full bg-white text-black font-black p-5 rounded-2xl hover:bg-zinc-200 transition-all uppercase tracking-widest text-xs"
                >
                  Update Core
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings / Alert Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-xs glass-panel rounded-[40px] p-10 shadow-2xl border-white/10"
            >
              <h2 className="text-xl font-bold mb-2 text-center tracking-tighter">SMS ALERTS</h2>
              <p className="text-[10px] font-mono text-zinc-500 text-center tracking-widest uppercase mb-8">Biometric Notifications</p>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Phone Number</label>
                  <input 
                    type="tel"
                    placeholder="+1234567890"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-center font-mono text-emerald-500 focus:outline-none focus:border-emerald-500/50"
                  />
                  <p className="text-[8px] text-zinc-600 text-center uppercase tracking-wider">Alert triggers at 600 KCAL</p>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full bg-emerald-500 text-black font-black p-5 rounded-2xl hover:bg-emerald-400 transition-all uppercase tracking-widest text-xs"
                >
                  Save Sync
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
