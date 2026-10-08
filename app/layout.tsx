import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'WOO虎 · 校园营销工作台',description:'策划、内容、执行与复盘，在同一个工作台接力。',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
