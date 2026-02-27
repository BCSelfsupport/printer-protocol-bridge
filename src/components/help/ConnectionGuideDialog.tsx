import { useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Network, Monitor, Shield, Printer, Cable, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ConnectionGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GUIDE_STEPS = [
  {
    title: 'Network Overview',
    icon: Network,
    image: '/help/step-network-diagram.png',
    content: [
      'Your PC and printer must be on the **same IP subnet** to communicate.',
      'Use an Ethernet cable from your PC to a switch or router, then another cable from the switch/router to the printer.',
      'Example network setup:',
    ],
    details: [
      { label: 'PC IP Address', value: '192.168.1.10' },
      { label: 'Printer IP Address', value: '192.168.1.55' },
      { label: 'Subnet Mask', value: '255.255.255.0' },
      { label: 'Default Gateway', value: '192.168.1.1' },
    ],
    tip: 'Ethernet is recommended over Wi-Fi for reliable printer communication. If using both, set Ethernet to a lower metric (e.g., 10) than Wi-Fi (e.g., 50) so traffic routes correctly.',
  },
  {
    title: 'Configure PC IP Address',
    icon: Monitor,
    image: '/help/step-ip-config.png',
    content: [
      'Your PC needs a **static IP address** on the same subnet as the printer.',
      'Follow these steps in Windows:',
    ],
    steps: [
      'Open **Settings → Network & Internet → Ethernet**',
      'Click **Edit** under IP assignment',
      'Select **Manual** and enable **IPv4**',
      'Set IP address: **192.168.1.10** (or any unused address)',
      'Subnet mask: **255.255.255.0**',
      'Default gateway: **192.168.1.1** (your router)',
      'Click **Save**',
    ],
    tip: 'Make sure the IP address you choose is not already used by another device on the network. The first three octets (e.g., 192.168.1.x) must match the printer.',
  },
  {
    title: 'Configure Firewall',
    icon: Shield,
    image: '/help/step-firewall.png',
    content: [
      'Windows Firewall must allow **TCP traffic on port 23** (Telnet) for CodeSync to communicate with the printer.',
    ],
    steps: [
      'Open **Windows Defender Firewall with Advanced Security**',
      'Click **Inbound Rules → New Rule**',
      'Select **Port** → Next',
      'Select **TCP** and enter port **23** → Next',
      'Select **Allow the connection** → Next',
      'Check all profiles (Domain, Private, Public) → Next',
      'Name it **CodeSync Printer Port** → Finish',
      'Repeat for **Outbound Rules**',
    ],
    tip: 'You can verify connectivity by opening Command Prompt and typing: telnet 192.168.1.55 23. If the screen goes blank, the connection works.',
  },
  {
    title: 'Enable Remote Comms on Printer',
    icon: Printer,
    image: '/help/step-printer-panel.png',
    content: [
      'The printer must have **Remote Communications (Telnet)** enabled on its front panel before CodeSync can connect.',
    ],
    steps: [
      'On the printer HMI, navigate to **Setup → Communications**',
      'Find **Remote Comms** or **Telnet** setting',
      'Set it to **Enabled**',
      'Confirm the port is set to **23** (default)',
      'Save and exit the menu',
    ],
    tip: 'Most printers support only ONE active Telnet session at a time. If another application or session is connected, close it first (via the printer HMI "Red X" or power cycle the printer).',
  },
  {
    title: 'Add Printer in CodeSync',
    icon: Cable,
    image: '/help/step-click-printer-icon.png',
    content: [
      'Once a printer has been added, you need to configure its **communication settings** (name, IP address, and port).',
      'To do this, click the **printer icon** on the printer card as shown above. This opens the edit dialog where you can set the connection details.',
    ],
    steps: [
      'On the Printers screen, click the **+ Add** button to create a new printer',
      'Click the **printer icon** (🖨️) on the card to open the edit dialog',
      'Enter a **Printer Name** (e.g., "Line 1 Printer")',
      'Enter the **IP Address** (e.g., 192.168.1.55)',
      'Enter the **Port** (default: 23)',
      'Click **Save** to apply your changes',
    ],
    tip: 'The tooltip "Click to edit printer" appears when you hover over the printer icon. The printer name is for your reference only — it does not affect the connection.',
  },
  {
    title: 'Connect & Verify',
    icon: CheckCircle2,
    image: '/help/step-printer-config.png',
    content: [
      'With the printer added, you can now connect to it.',
    ],
    steps: [
      'Click on the printer card to select it',
      'Click the **Connect** button',
      'The header will show **Connected** with the IP address in green',
      'You should now see live printer status on the Dashboard',
    ],
    tip: 'If connection fails: (1) Verify the printer is powered on, (2) Check the Ethernet cable, (3) Confirm Remote Comms is enabled on the printer, (4) Ensure no other Telnet session is active, (5) Check your firewall settings.',
  },
];

export function ConnectionGuideDialog({ open, onOpenChange }: ConnectionGuideDialogProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = GUIDE_STEPS[currentStep];
  const StepIcon = step.icon;

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, GUIDE_STEPS.length - 1));
  const goPrev = () => setCurrentStep((s) => Math.max(s - 1, 0));

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setCurrentStep(0); }}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] p-4 md:p-6 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base md:text-lg text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            Connection Setup Guide
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-3">
          {GUIDE_STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i === currentStep ? 'bg-blue-500' : i < currentStep ? 'bg-emerald-500/60' : 'bg-slate-600'
              }`}
            />
          ))}
        </div>

        <ScrollArea className="h-[calc(85vh-180px)] min-h-[300px]">
          <div className="space-y-4 pr-2">
            {/* Step header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                <StepIcon className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-xs text-slate-400">Step {currentStep + 1} of {GUIDE_STEPS.length}</div>
                <div className="text-lg font-semibold text-white">{step.title}</div>
              </div>
            </div>

            {/* Image */}
            <div className="rounded-lg overflow-hidden border border-slate-600 bg-slate-900">
              <img
                src={step.image}
                alt={step.title}
                className="w-full h-auto object-contain max-h-[300px]"
              />
            </div>

            {/* Content text */}
            <div className="space-y-2">
              {step.content.map((text, i) => (
                <p
                  key={i}
                  className="text-sm text-slate-300"
                  dangerouslySetInnerHTML={{
                    __html: text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>'),
                  }}
                />
              ))}
            </div>

            {/* Details table */}
            {'details' in step && step.details && (
              <div className="bg-slate-800/80 rounded-lg border border-slate-600 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {step.details.map((d, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-slate-700/30' : ''}>
                        <td className="px-3 py-2 text-slate-400 font-medium">{d.label}</td>
                        <td className="px-3 py-2 text-white font-mono">{d.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Numbered steps */}
            {'steps' in step && step.steps && (
              <ol className="space-y-2 ml-1">
                {step.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                    <span className="w-6 h-6 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-xs text-blue-300 font-bold flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span
                      dangerouslySetInnerHTML={{
                        __html: s.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>'),
                      }}
                    />
                  </li>
                ))}
              </ol>
            )}

            {/* Tip box */}
            {step.tip && (
              <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-3">
                <p className="text-xs text-amber-300">
                  <strong className="text-amber-200">💡 Tip:</strong> {step.tip}
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-700">
          <Button
            variant="ghost"
            size="sm"
            onClick={goPrev}
            disabled={currentStep === 0}
            className="text-slate-300 hover:text-white"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <span className="text-xs text-slate-500">
            {currentStep + 1} / {GUIDE_STEPS.length}
          </span>
          {currentStep < GUIDE_STEPS.length - 1 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={goNext}
              className="text-slate-300 hover:text-white"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => { onOpenChange(false); setCurrentStep(0); }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Done
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
