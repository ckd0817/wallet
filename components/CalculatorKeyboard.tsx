import React, { useState, useCallback } from 'react';
import { Calculator, RotateCcw, X } from 'lucide-react';

interface CalculatorKeyboardProps {
  onResult: (value: string) => void;
  onClose: () => void;
}

const CalculatorKeyboard: React.FC<CalculatorKeyboardProps> = ({ onResult, onClose }) => {
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('');
  const [isNewCalculation, setIsNewCalculation] = useState(true);

  // 计算表达式结果
  const calculateResult = useCallback((expr: string) => {
    try {
      // 替换显示符号为计算符号
      const normalizedExpr = expr.replace(/×/g, '*').replace(/÷/g, '/');

      // 验证表达式
      if (!normalizedExpr || /[\+\-\*\/]$/.test(normalizedExpr)) {
        return '';
      }

      // 使用Function构造函数安全计算
      // eslint-disable-next-line no-new-func
      const calcResult = new Function('return ' + normalizedExpr)();

      if (!isFinite(calcResult)) {
        return '错误';
      }

      // 处理小数位数，最多保留2位
      const roundedResult = Math.round(calcResult * 100) / 100;
      return roundedResult.toString();
    } catch (error) {
      return '错误';
    }
  }, []);

  // 添加触觉反馈
  const triggerHapticFeedback = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }, []);

  // 处理按钮点击
  const handleButtonClick = useCallback((value: string) => {
    triggerHapticFeedback();

    if (isNewCalculation && !isNaN(Number(value))) {
      // 如果是新计算且输入的是数字，重新开始
      setExpression(value);
      setIsNewCalculation(false);
    } else {
      setExpression(prev => prev + value);
    }
  }, [isNewCalculation, triggerHapticFeedback]);

  // 处理操作符
  const handleOperator = useCallback((operator: string) => {
    triggerHapticFeedback();

    setExpression(prev => {
      // 如果表达式为空或最后一个字符是操作符，不允许添加
      if (!prev || /[\+\-\*\/×÷]$/.test(prev)) {
        return prev;
      }
      return prev + operator;
    });
    setIsNewCalculation(false);
  }, [triggerHapticFeedback]);

  // 处理等号
  const handleEquals = useCallback(() => {
    if (!expression) return;

    triggerHapticFeedback();

    const calcResult = calculateResult(expression);
    if (calcResult && calcResult !== '错误') {
      setResult(calcResult);
      setIsNewCalculation(true);

      // 延迟一点时间再调用onResult，让用户看到结果
      setTimeout(() => {
        onResult(calcResult);
      }, 300);
    }
  }, [expression, calculateResult, onResult, triggerHapticFeedback]);

  // 处理清除
  const handleClear = useCallback(() => {
    triggerHapticFeedback();
    setExpression('');
    setResult('');
    setIsNewCalculation(true);
  }, [triggerHapticFeedback]);

  // 处理删除
  const handleDelete = useCallback(() => {
    triggerHapticFeedback();

    setExpression(prev => {
      const newExpr = prev.slice(0, -1);
      if (!newExpr) {
        setIsNewCalculation(true);
        setResult('');
      } else {
        // 重新计算结果
        const calcResult = calculateResult(newExpr);
        setResult(calcResult);
      }
      return newExpr;
    });
  }, [calculateResult, triggerHapticFeedback]);

  // 实时更新结果
  React.useEffect(() => {
    if (expression && !isNewCalculation) {
      const calcResult = calculateResult(expression);
      setResult(calcResult);
    } else if (!expression) {
      setResult('');
    }
  }, [expression, isNewCalculation, calculateResult]);

  const Button = ({ onClick, className = '', children, ...props }: any) => (
    <button
      onClick={onClick}
      className={`active:scale-95 active:shadow-inner transition-all duration-150 font-medium text-lg relative overflow-hidden shadow-sm ${className}`}
      {...props}
    >
      {children}
      <div className="absolute inset-0 bg-white opacity-0 active:opacity-20 transition-opacity duration-100"></div>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-sm animate-fade-in">
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <button
            onClick={handleClear}
            className="p-2 text-secondary hover:text-primary transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-primary">
            <Calculator className="w-5 h-5" />
            <span className="font-medium">计算器</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-secondary hover:text-primary transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Display */}
        <div className="p-6 bg-surface">
          <div className="text-right mb-2 transition-all duration-200">
            <div className={`text-3xl font-bold text-primary min-h-[40px] break-all transition-all duration-200 ${
              expression && expression !== '0' ? 'scale-100 opacity-100' : 'scale-95 opacity-60'
            }`}>
              {expression || '0'}
            </div>
            {result && result !== '错误' && (
              <div className="text-sm text-success font-medium animate-fade-in">
                = {result}
              </div>
            )}
            {result === '错误' && (
              <div className="text-sm text-danger font-medium animate-pulse">
                表达式错误
              </div>
            )}
          </div>
        </div>

        {/* Keyboard */}
        <div className="p-4 bg-background">
          <div className="grid grid-cols-4 gap-3">
            {/* 第一行 */}
            <Button
              onClick={() => handleButtonClick('7')}
              className="bg-surface text-primary py-6 rounded-2xl hover:bg-border text-xl"
            >
              7
            </Button>
            <Button
              onClick={() => handleButtonClick('8')}
              className="bg-surface text-primary py-6 rounded-2xl hover:bg-border text-xl"
            >
              8
            </Button>
            <Button
              onClick={() => handleButtonClick('9')}
              className="bg-surface text-primary py-6 rounded-2xl hover:bg-border text-xl"
            >
              9
            </Button>
            <Button
              onClick={() => handleOperator('÷')}
              className="bg-primary text-white py-6 rounded-2xl hover:bg-opacity-80 text-xl font-bold"
            >
              ÷
            </Button>

            {/* 第二行 */}
            <Button
              onClick={() => handleButtonClick('4')}
              className="bg-surface text-primary py-6 rounded-2xl hover:bg-border text-xl"
            >
              4
            </Button>
            <Button
              onClick={() => handleButtonClick('5')}
              className="bg-surface text-primary py-6 rounded-2xl hover:bg-border text-xl"
            >
              5
            </Button>
            <Button
              onClick={() => handleButtonClick('6')}
              className="bg-surface text-primary py-6 rounded-2xl hover:bg-border text-xl"
            >
              6
            </Button>
            <Button
              onClick={() => handleOperator('×')}
              className="bg-primary text-white py-6 rounded-2xl hover:bg-opacity-80 text-xl font-bold"
            >
              ×
            </Button>

            {/* 第三行 */}
            <Button
              onClick={() => handleButtonClick('1')}
              className="bg-surface text-primary py-6 rounded-2xl hover:bg-border text-xl"
            >
              1
            </Button>
            <Button
              onClick={() => handleButtonClick('2')}
              className="bg-surface text-primary py-6 rounded-2xl hover:bg-border text-xl"
            >
              2
            </Button>
            <Button
              onClick={() => handleButtonClick('3')}
              className="bg-surface text-primary py-6 rounded-2xl hover:bg-border text-xl"
            >
              3
            </Button>
            <Button
              onClick={() => handleOperator('-')}
              className="bg-primary text-white py-6 rounded-2xl hover:bg-opacity-80 text-xl font-bold"
            >
              −
            </Button>

            {/* 第四行 */}
            <Button
              onClick={() => handleButtonClick('0')}
              className="bg-surface text-primary py-6 rounded-2xl hover:bg-border text-xl"
            >
              0
            </Button>
            <Button
              onClick={() => handleButtonClick('.')}
              className="bg-surface text-primary py-6 rounded-2xl hover:bg-border text-2xl"
            >
              .
            </Button>
            <Button
              onClick={handleDelete}
              className="bg-surface text-primary py-6 rounded-2xl hover:bg-border flex items-center justify-center text-lg"
            >
              ⌫
            </Button>
            <Button
              onClick={() => handleOperator('+')}
              className="bg-primary text-white py-6 rounded-2xl hover:bg-opacity-80 text-xl font-bold"
            >
              +
            </Button>

            {/* 等号按钮 */}
            <Button
              onClick={handleEquals}
              className={`col-span-4 py-6 rounded-2xl font-bold text-2xl transition-all duration-200 ${
                expression && result && result !== '错误'
                  ? 'bg-success text-white hover:bg-opacity-90 shadow-lg'
                  : 'bg-surface text-secondary cursor-not-allowed'
              }`}
              disabled={!expression || (result === '错误')}
            >
              = {result && result !== '错误' && result !== '' ? result : ''}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalculatorKeyboard;