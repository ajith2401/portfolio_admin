// src/app/admin/Dashboard/components/Sidebar.js
'use client';

import React from 'react';
import { 
Layout, Book, Code, PenTool, Settings, BarChart,
Menu, X
} from 'lucide-react';

export const Sidebar = ({ collapsed, toggleSidebar, currentSection, setCurrentSection }) => {
const menuItems = [
    { icon: Layout, label: 'Dashboard', section: 'dashboard' },
    { icon: Book, label: 'Tech Blog', section: 'techblog' },
    { icon: PenTool, label: 'Writings', section: 'writings' },
    { icon: Code, label: 'Projects', section: 'projects' },
    { icon: BarChart, label: 'Analytics', section: 'analytics' },
    { icon: Settings, label: 'Settings', section: 'settings' },
];

return (
    <div className={`bg-background border-r flex flex-col h-screen fixed transition-all duration-300 
    ${collapsed ? 'w-16' : 'w-64'}`}
    >
    <div className="p-4 border-b flex items-center justify-between">
        {!collapsed && <span className="font-bold text-lg">Admin CMS</span>}
        <button onClick={toggleSidebar} className="p-1 hover:bg-gray-100 rounded">
        {collapsed ? <Menu size={20} /> : <X size={20} />}
        </button>
    </div>

    <nav className="flex-1 p-4">
        {menuItems.map((item) => (
        <button
            key={item.section}
            onClick={() => setCurrentSection(item.section)}
            className={`flex items-center w-full py-2 px-3 mb-2 rounded-lg transition-colors
            ${currentSection === item.section ? 'bg-primary text-white' : 'hover:bg-gray-100'}
            ${collapsed ? 'justify-center' : ''}`}
        >
            <item.icon size={20} />
            {!collapsed && <span className="ml-3">{item.label}</span>}
        </button>
        ))}
    </nav>
    </div>
);
};

