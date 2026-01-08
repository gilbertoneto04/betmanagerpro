import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Task, Account, Pack } from '../types';
import { DollarSign, Filter, Calendar, TrendingUp } from 'lucide-react';

interface InsightsProps {
  tasks: Task[];
  accounts: Account[];
  availableHouses: string[];
  packs: Pack[];
}

export const Insights: React.FC<InsightsProps> = ({ accounts, availableHouses, packs }) => {
  // --- Filters State ---
  const [selectedHouse, setSelectedHouse] = useState<string>('ALL');
  const [dateType, setDateType] = useState<'REGISTER' | 'LIMIT'>('REGISTER');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // --- Helper: Calculate Cost Per Account for each Pack ---
  const packCostMap = useMemo(() => {
    const map: Record<string, number> = {};
    packs.forEach(p => {
        if (p.quantity > 0) {
            map[p.id] = p.price / p.quantity;
        }
    });
    return map;
  }, [packs]);

  // --- Metrics Calculation ---
  const filteredData = useMemo(() => {
    let list = accounts.filter(a => a.status !== 'DELETED'); // Exclude deleted usually? Or keep them? User said "contas utilizadas", usually implies all valid ones. Let's exclude DELETED for analytics accuracy or keep if needed. Let's exclude purely deleted/trash ones.
    
    // House Filter
    if (selectedHouse !== 'ALL') {
        list = list.filter(a => a.house === selectedHouse);
    }

    // Date Filter
    if (startDate || endDate) {
        list = list.filter(a => {
            const dateStr = dateType === 'LIMIT' ? a.limitedAt : a.createdAt;
            if (!dateStr) return false; // If filtering by Limit and account is not limited, exclude it.
            
            const date = new Date(dateStr).getTime();
            const start = startDate ? new Date(startDate).setHours(0,0,0,0) : 0;
            const end = endDate ? new Date(endDate).setHours(23,59,59,999) : Infinity;

            return date >= start && date <= end;
        });
    } else if (dateType === 'LIMIT') {
        // If no date range, but type is LIMIT, filter only those who have limitedAt
        list = list.filter(a => a.limitedAt);
    }

    return list;
  }, [accounts, selectedHouse, dateType, startDate, endDate]);

  const totalCost = useMemo(() => {
      return filteredData.reduce((sum, acc) => {
          if (acc.packId && packCostMap[acc.packId]) {
              return sum + packCostMap[acc.packId];
          }
          return sum; // If no pack or manual, cost is 0 (based on prompt req)
      }, 0);
  }, [filteredData, packCostMap]);

  // --- Duration Chart Data (Limit Date - Register Date) ---
  const durationData = useMemo(() => {
      // 1. Group by House
      const houseDurations: Record<string, { totalDays: number, count: number }> = {};
      
      // Initialize houses
      availableHouses.forEach(h => houseDurations[h] = { totalDays: 0, count: 0 });

      // Iterate ALL accounts (or filtered? usually global average is better, but let's respect current filters to drill down)
      // Actually, for "Duration", we need accounts that ARE limited.
      const relevantAccounts = filteredData.filter(a => a.limitedAt && a.createdAt);

      relevantAccounts.forEach(acc => {
          if (!acc.limitedAt) return;
          const start = new Date(acc.createdAt).getTime();
          const end = new Date(acc.limitedAt).getTime();
          const diffTime = Math.abs(end - start);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

          if (!houseDurations[acc.house]) houseDurations[acc.house] = { totalDays: 0, count: 0 };
          
          houseDurations[acc.house].totalDays += diffDays;
          houseDurations[acc.house].count += 1;
      });

      // Format for Recharts
      return Object.entries(houseDurations)
        .map(([house, data]) => ({
            name: house,
            dias: data.count > 0 ? Math.round(data.totalDays / data.count) : 0,
            qtd: data.count
        }))
        .filter(d => d.qtd > 0) // Only show houses with data
        .sort((a, b) => b.dias - a.dias);

  }, [filteredData, availableHouses]);

  // Custom Tooltip for dark mode
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl">
          <p className="text-slate-200 font-semibold mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-10">
      <div>
        <h2 className="text-2xl font-bold text-white">Insights & Custos</h2>
        <p className="text-slate-400 text-sm mt-1">Análise de contas utilizadas, custos e duração média.</p>
      </div>

      {/* Filters Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col md:flex-row gap-4 items-end">
             <div className="w-full md:w-auto">
                 <label className="text-xs font-medium text-slate-400 mb-1 block">Filtrar por Casa</label>
                 <select 
                    value={selectedHouse}
                    onChange={(e) => setSelectedHouse(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500"
                 >
                     <option value="ALL">Todas</option>
                     {availableHouses.map(h => <option key={h} value={h}>{h}</option>)}
                 </select>
             </div>

             <div className="w-full md:w-auto">
                 <label className="text-xs font-medium text-slate-400 mb-1 block">Considerar Data de:</label>
                 <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                     <button 
                        onClick={() => setDateType('REGISTER')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${dateType === 'REGISTER' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                     >
                        Registro
                     </button>
                     <button 
                        onClick={() => setDateType('LIMIT')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${dateType === 'LIMIT' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                     >
                        Limitação
                     </button>
                 </div>
             </div>

             <div className="w-full md:w-auto">
                 <label className="text-xs font-medium text-slate-400 mb-1 block">De:</label>
                 <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500"
                 />
             </div>

             <div className="w-full md:w-auto">
                 <label className="text-xs font-medium text-slate-400 mb-1 block">Até:</label>
                 <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500"
                 />
             </div>
             
             <div className="w-full md:w-auto pb-0.5">
                 <button 
                    onClick={() => { setStartDate(''); setEndDate(''); setSelectedHouse('ALL'); setDateType('REGISTER'); }}
                    className="w-full md:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm border border-slate-700 flex items-center justify-center gap-2"
                 >
                     <Filter size={14} /> Limpar
                 </button>
             </div>
          </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm flex items-center justify-between">
           <div>
              <p className="text-sm text-slate-400 font-medium mb-1">Contas Utilizadas (Filtro)</p>
              <h3 className="text-3xl font-bold text-white">{filteredData.length}</h3>
              <p className="text-xs text-slate-500 mt-1">
                 {selectedHouse === 'ALL' ? 'Todas as casas' : selectedHouse} • {dateType === 'REGISTER' ? 'Data Registro' : 'Data Limitação'}
              </p>
           </div>
           <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-400 border border-indigo-500/20">
               <Calendar size={24} />
           </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm flex items-center justify-between">
           <div>
              <p className="text-sm text-slate-400 font-medium mb-1">Custo Total Estimado</p>
              <h3 className="text-3xl font-bold text-emerald-400">R$ {totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
              <p className="text-xs text-slate-500 mt-1">
                 Baseado no custo unitário dos Packs
              </p>
           </div>
           <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-400 border border-emerald-500/20">
               <DollarSign size={24} />
           </div>
        </div>
      </div>

      {/* Duration Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp className="text-amber-500" size={20} />
                Duração Média das Contas (Dias)
            </h3>
            <span className="text-xs text-slate-500 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                Data Limitação - Data Registro
            </span>
        </div>
        
        <div className="h-[350px] w-full">
            {durationData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={durationData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <RechartsTooltip content={<CustomTooltip />} cursor={{fill: '#1e293b'}} />
                        <Legend />
                        <Bar name="Média de Dias" dataKey="dias" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={50} />
                    </BarChart>
                </ResponsiveContainer>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500">
                    <p>Sem dados suficientes para calcular duração média no período selecionado.</p>
                    <p className="text-xs mt-2 opacity-70">Certifique-se de que as contas possuem Data de Limitação.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};