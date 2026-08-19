import { Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';

export function ScoreTrend({ data }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
        <Tooltip contentStyle={{ background: '#1c1712', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: 'rgba(255,255,255,0.6)' }} />
        <Line type="monotone" dataKey="score" stroke="#f97316" strokeWidth={2} dot={{ r: 4, fill: '#f97316' }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
