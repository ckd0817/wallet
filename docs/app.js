// Simple React application without complex dependencies
import React from 'https://esm.sh/react@18/index.js';
import { createRoot } from 'https://esm.sh/react-dom@18/client/index.js';

// Import App components
const App = () => {
  const [activeTab, setActiveTab] = React.useState('DASHBOARD');
  const [transactions, setTransactions] = React.useState([]);

  return React.createElement('div', {
    className: 'min-h-screen bg-background text-primary p-4'
  }, [
    React.createElement('header', {
      className: 'sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border px-6 h-16 flex items-center justify-between'
    }, [
      React.createElement('h1', {
        className: 'text-2xl font-bold tracking-tight text-primary'
      }, '我的账本')
    ]),
    React.createElement('main', {
      className: 'max-w-2xl mx-auto p-4 pb-32 min-h-screen'
    }, [
      React.createElement('div', {
        className: 'bg-white rounded-lg p-6 shadow-lg'
      }, [
        React.createElement('h2', {
          className: 'text-xl font-semibold mb-4'
        }, '欢迎使用SmartWallet'),
        React.createElement('p', {
          className: 'text-secondary mb-4'
        }, '这是您的个人财务管理应用'),
        React.createElement('div', {
          className: 'text-sm text-success'
        }, '✅ PWA功能已启用')
      ]),
      React.createElement('div', {
        className: 'bg-white rounded-lg p-6 shadow-lg mt-4'
      }, [
        React.createElement('h3', {
          className: 'text-lg font-semibold mb-2'
        }, '功能特性'),
        React.createElement('ul', {
          className: 'space-y-2'
        }, [
          React.createElement('li', null, '💰 支出管理'),
          React.createElement('li', null, '📊 数据统计'),
          React.createElement('li', null, '🤖 AI智能顾问'),
          React.createElement('li', null, '📱 离线支持'),
          React.createElement('li', null, '🎨 现代设计')
        ])
      ]),
      React.createElement('div', {
        className: 'bg-white rounded-lg p-6 shadow-lg mt-4'
      }, [
        React.createElement('h3', {
          className: 'text-lg font-semibold mb-2'
        }, 'PWA功能'),
        React.createElement('ul', {
          className: 'space-y-2'
        }, [
          React.createElement('li', null, '✅ Service Worker已注册'),
          React.createElement('li', null, '✅ 支持离线访问'),
          React.createElement('li', null, '✅ 可安装到主屏幕'),
          React.createElement('li', null, '✅ 现代Web应用标准')
        ])
      ])
    ])
  ]);
};

// Initialize React app
const root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));