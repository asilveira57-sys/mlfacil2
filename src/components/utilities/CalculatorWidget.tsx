import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, X, Delete, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CalculatorWidgetProps {
  variant?: 'icon' | 'full';
  className?: string;
}

interface HistoryEntry {
  expression: string;
  result: string;
}

const BUTTONS = [
  ['C', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '⌫', '='],
];

export function CalculatorWidget({
  variant = 'icon',
  className,
}: CalculatorWidgetProps) {
  const { t } = useTranslation();
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [open, setOpen] = useState(false);

  // Keyboard support
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === '.') {
        handleDot();
      } else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
        const opMap: Record<string, string> = {
          '+': '+',
          '-': '-',
          '*': '×',
          '/': '÷',
        };
        handleOperation(opMap[e.key]);
      } else if (e.key === 'Enter' || e.key === '=') {
        handleEquals();
      } else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') {
        handleClear();
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, display, previousValue, operation, waitingForOperand]);

  const handleDigit = useCallback((digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  }, [display, waitingForOperand]);

  const handleDot = useCallback(() => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
    } else if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  }, [display, waitingForOperand]);

  const handleOperation = useCallback((op: string) => {
    const currentValue = parseFloat(display);
    
    if (previousValue !== null && !waitingForOperand) {
      const result = calculate(previousValue, currentValue, operation!);
      setDisplay(String(result));
      setPreviousValue(result);
    } else {
      setPreviousValue(currentValue);
    }
    
    setOperation(op);
    setWaitingForOperand(true);
  }, [display, previousValue, operation, waitingForOperand]);

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const handleEquals = useCallback(() => {
    if (previousValue === null || operation === null) return;
    
    const currentValue = parseFloat(display);
    const result = calculate(previousValue, currentValue, operation);
    
    // Add to history
    const expression = `${previousValue} ${operation} ${currentValue}`;
    setHistory(prev => [...prev.slice(-19), { expression, result: String(result) }]);
    
    setDisplay(String(result));
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(true);
  }, [display, previousValue, operation]);

  const handleClear = useCallback(() => {
    setDisplay('0');
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(false);
  }, []);

  const handleBackspace = useCallback(() => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  }, [display]);

  const handleToggleSign = useCallback(() => {
    const value = parseFloat(display);
    setDisplay(String(-value));
  }, [display]);

  const handlePercent = useCallback(() => {
    const value = parseFloat(display);
    setDisplay(String(value / 100));
  }, [display]);

  const handleButton = useCallback((btn: string) => {
    if (btn >= '0' && btn <= '9') {
      handleDigit(btn);
    } else if (btn === '.') {
      handleDot();
    } else if (['+', '-', '×', '÷'].includes(btn)) {
      handleOperation(btn);
    } else if (btn === '=') {
      handleEquals();
    } else if (btn === 'C') {
      handleClear();
    } else if (btn === '⌫') {
      handleBackspace();
    } else if (btn === '±') {
      handleToggleSign();
    } else if (btn === '%') {
      handlePercent();
    }
  }, [handleDigit, handleDot, handleOperation, handleEquals, handleClear, handleBackspace, handleToggleSign, handlePercent]);

  const getButtonStyle = (btn: string) => {
    if (btn === '=') return 'bg-primary text-primary-foreground hover:bg-primary/90';
    if (['+', '-', '×', '÷'].includes(btn)) return 'bg-accent text-accent-foreground hover:bg-accent/80';
    if (['C', '±', '%'].includes(btn)) return 'bg-muted text-muted-foreground hover:bg-muted/80';
    return 'bg-card hover:bg-muted/50';
  };

  const calculatorContent = (
    <div className="space-y-4">
      {/* Display */}
      <div className="relative">
        <div className="text-right p-4 text-3xl font-mono bg-muted rounded-lg overflow-hidden">
          <div className="truncate">{display}</div>
          {operation && previousValue !== null && (
            <div className="text-xs text-muted-foreground mt-1">
              {previousValue} {operation}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 left-2 h-8 w-8"
          onClick={() => setShowHistory(!showHistory)}
        >
          <History className="h-4 w-4" />
        </Button>
      </div>

      {/* History Panel */}
      {showHistory && (
        <ScrollArea className="h-32 rounded-lg border p-2">
          {history.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">
              {t('utilities:calculator.no_history')}
            </p>
          ) : (
            <div className="space-y-1">
              {history.slice().reverse().map((entry, i) => (
                <div 
                  key={i} 
                  className="flex justify-between text-sm py-1 border-b last:border-0"
                  onClick={() => setDisplay(entry.result)}
                >
                  <span className="text-muted-foreground">{entry.expression}</span>
                  <span className="font-medium">= {entry.result}</span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      )}

      {/* Buttons */}
      <div className="grid grid-cols-4 gap-2">
        {BUTTONS.flat().map((btn) => (
          <Button
            key={btn}
            variant="outline"
            className={cn(
              'h-12 text-lg font-medium',
              btn === '0' && 'col-span-1',
              getButtonStyle(btn)
            )}
            onClick={() => handleButton(btn)}
          >
            {btn === '⌫' ? <Delete className="h-5 w-5" /> : btn}
          </Button>
        ))}
      </div>
    </div>
  );

  if (variant === 'icon') {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn('h-8 w-8', className)}
                >
                  <Calculator className="h-4 w-4" />
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('utilities:calculator.title')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              {t('utilities:calculator.title')}
            </DialogTitle>
          </DialogHeader>
          {calculatorContent}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className={cn('p-4 rounded-lg border bg-card', className)}>
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="h-5 w-5 text-primary" />
        <span className="font-medium">{t('utilities:calculator.title')}</span>
      </div>
      {calculatorContent}
    </div>
  );
}
