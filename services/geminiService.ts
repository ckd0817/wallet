import { GoogleGenAI } from "@google/genai";
import { Transaction, Category } from "../types";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY is missing. Native Gemini features might not work.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const getFinancialAdvice = async (
  transactions: Transaction[],
  categories: Category[],
  query: string
): Promise<string> => {
  // 1. Check for Custom AI Configuration (OpenAI Compatible)
  const savedConfig = localStorage.getItem('smartwallet_ai_config');
  if (savedConfig) {
    try {
      const config = JSON.parse(savedConfig);
      if (config.apiKey) {
        return await callOpenAICompatibleAPI(config, transactions, categories, query);
      }
    } catch (e) {
      console.error("Failed to parse AI config", e);
    }
  }

  // 2. Fallback to default Gemini implementation
  const client = getClient();
  if (!client) return "请在设置中配置 API Key 以使用 AI 顾问功能。";

  // Prepare data context
  const context = prepareContext(transactions, categories);

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
        你是一位专业、友好且善于鼓励的个人理财助手。
        请分析以下的财务数据并回答用户的问题。
        
        要求：
        1. 回答要简洁明了，语气亲切。
        2. 使用中文回答。
        3. 格式化为 Markdown。
        
        数据背景:
        ${context}

        用户问题:
        ${query}
      `,
      config: {
        systemInstruction: "你是一个个人理财应用的智能顾问。请用中文简练地回答。",
      }
    });

    return response.text || "暂时无法生成回答。";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "抱歉，分析数据时出现了错误，请稍后再试或检查网络。";
  }
};

// Helper: Prepare Data Context
const prepareContext = (transactions: Transaction[], categories: Category[]) => {
  const recentTransactions = transactions.slice(0, 50);
  const summary = transactions.reduce((acc, t) => {
    if (t.type === 'expense') acc.totalExpense += t.amount;
    else acc.totalIncome += t.amount;
    return acc;
  }, { totalExpense: 0, totalIncome: 0 });

  const categoryMap = categories.reduce((acc, c) => {
    acc[c.id] = c.name;
    return acc;
  }, {} as Record<string, string>);

  return JSON.stringify({
    summary,
    recentTransactions: recentTransactions.map(t => ({
      date: t.date,
      type: t.type === 'expense' ? '支出' : '收入',
      category: categoryMap[t.categoryId] || t.categoryId,
      amount: t.amount,
      note: t.note
    }))
  });
};

// Helper: Call OpenAI Compatible API
const callOpenAICompatibleAPI = async (
  config: { apiKey: string; baseUrl: string; model: string },
  transactions: Transaction[],
  categories: Category[],
  query: string
): Promise<string> => {
  const context = prepareContext(transactions, categories);
  const baseUrl = config.baseUrl.replace(/\/+$/, ''); // Remove trailing slash
  const url = `${baseUrl}/chat/completions`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model || 'gpt-3.5-turbo',
        messages: [
          {
            role: "system",
            content: "你是一个个人理财应用的智能顾问。请根据提供的财务数据用中文回答用户问题，格式为Markdown，语气友好专业。"
          },
          {
            role: "user",
            content: `数据背景:\n${context}\n\n用户问题:\n${query}`
          }
        ],
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "未收到有效的 AI 回复。";
  } catch (error: any) {
    console.error("Custom AI API Error:", error);
    return `AI 请求失败: ${error.message}`;
  }
};
