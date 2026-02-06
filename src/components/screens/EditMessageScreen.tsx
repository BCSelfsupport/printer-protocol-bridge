import { useState, useEffect } from 'react';
import { Save, X, Plus, Trash2 } from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageCanvas } from '@/components/messages/MessageCanvas';

export interface MessageField {
  id: number;
  type: 'text' | 'date' | 'time' | 'counter' | 'logo';
  data: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MessageDetails {
  name: string;
  height: number;
  width: number;
  fields: MessageField[];
}

// Available template heights (dot rows)
const TEMPLATE_HEIGHTS = [7, 9, 11, 16, 24, 32] as const;
type TemplateHeight = typeof TEMPLATE_HEIGHTS[number];

interface EditMessageScreenProps {
  messageName: string;
  onSave: (message: MessageDetails) => void;
  onCancel: () => void;
  onGetMessageDetails?: (name: string) => Promise<MessageDetails | null>;
}

export function EditMessageScreen({
  messageName,
  onSave,
  onCancel,
  onGetMessageDetails,
}: EditMessageScreenProps) {
  const [message, setMessage] = useState<MessageDetails>({
    name: messageName,
    height: 16,
    width: 200,
    fields: [
      { id: 1, type: 'text', data: messageName, x: 0, y: 16, width: 60, height: 16 },
    ],
  });
  const [loading, setLoading] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(1);

  // Load message details when component mounts
  useEffect(() => {
    if (onGetMessageDetails) {
      setLoading(true);
      onGetMessageDetails(messageName)
        .then((details) => {
          if (details) {
            setMessage(details);
            if (details.fields.length > 0) {
              setSelectedFieldId(details.fields[0].id);
            }
          }
        })
        .finally(() => setLoading(false));
    }
  }, [messageName, onGetMessageDetails]);

  const selectedField = message.fields.find((f) => f.id === selectedFieldId);

  // Combine all field data for canvas preview
  const canvasContent = message.fields.map(f => f.data).join(' ');

  const handleFieldDataChange = (value: string) => {
    if (!selectedFieldId) return;
    setMessage((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.id === selectedFieldId ? { ...f, data: value } : f
      ),
    }));
  };

  const handleTemplateChange = (value: string) => {
    const height = parseInt(value) as TemplateHeight;
    setMessage((prev) => ({
      ...prev,
      height,
      // Update field Y positions to be within the template area
      fields: prev.fields.map((f) => ({
        ...f,
        y: Math.max(32 - height, f.y), // Ensure field is in visible area
        height: Math.min(f.height, height),
      })),
    }));
  };

  const handleAddField = () => {
    const newId = Math.max(0, ...message.fields.map((f) => f.id)) + 1;
    const newField: MessageField = {
      id: newId,
      type: 'text',
      data: '',
      x: message.fields.length * 50,
      y: 32 - message.height,
      width: 50,
      height: Math.min(16, message.height),
    };
    setMessage((prev) => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
    setSelectedFieldId(newId);
  };

  const handleDeleteField = () => {
    if (!selectedFieldId || message.fields.length <= 1) return;
    setMessage((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== selectedFieldId),
    }));
    setSelectedFieldId(message.fields[0]?.id ?? null);
  };

  const handleCanvasClick = (x: number, y: number) => {
    // Find which field was clicked
    const clickedField = message.fields.find(
      (f) => x >= f.x && x < f.x + f.width && y >= f.y && y < f.y + f.height
    );
    if (clickedField) {
      setSelectedFieldId(clickedField.id);
    }
  };

  return (
    <div className="flex-1 p-4 flex flex-col">
      <SubPageHeader title={`Edit: ${messageName}`} onHome={onCancel} />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-muted-foreground">Loading message...</span>
        </div>
      ) : (
        <>
          {/* Message Canvas - dot matrix preview */}
          <div className="mb-4">
            <MessageCanvas
              templateHeight={message.height}
              width={message.width}
              content={canvasContent}
              onCanvasClick={handleCanvasClick}
              selectedField={selectedField ? {
                x: selectedField.x,
                y: selectedField.y,
                width: selectedField.width,
                height: selectedField.height,
              } : null}
            />
          </div>

          {/* Message properties row */}
          <div className="bg-card rounded-lg p-4 mb-4">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label htmlFor="msgName">Message Name</Label>
                <Input
                  id="msgName"
                  value={message.name}
                  onChange={(e) =>
                    setMessage((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="msgTemplate">Template (Rows)</Label>
                <Select
                  value={message.height.toString()}
                  onValueChange={handleTemplateChange}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_HEIGHTS.map((h) => (
                      <SelectItem key={h} value={h.toString()}>
                        {h} dots
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="msgWidth">Width (dots)</Label>
                <Input
                  id="msgWidth"
                  type="number"
                  value={message.width}
                  onChange={(e) =>
                    setMessage((prev) => ({
                      ...prev,
                      width: parseInt(e.target.value) || 135,
                    }))
                  }
                  className="mt-1"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={handleAddField}
                  className="industrial-button text-white px-4 py-2 rounded flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Field
                </button>
              </div>
            </div>
          </div>

          {/* Fields editor */}
          <div className="bg-card rounded-lg p-4 mb-4 flex-1 overflow-auto">
            <div className="grid grid-cols-3 gap-4">
              {/* Field list */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-3 py-2 font-medium text-sm">
                  Fields ({message.fields.length})
                </div>
                {message.fields.map((field) => (
                  <div
                    key={field.id}
                    onClick={() => setSelectedFieldId(field.id)}
                    className={`p-3 border-b cursor-pointer hover:bg-muted/50 ${
                      selectedFieldId === field.id ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                    }`}
                  >
                    <div className="flex justify-between">
                      <span className="font-medium">Field {field.id}</span>
                      <span className="text-muted-foreground text-sm capitalize">
                        {field.type}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground truncate mt-1">
                      {field.data || '(empty)'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Field editor */}
              {selectedField && (
                <div className="border rounded-lg p-4 col-span-2">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-medium">Field {selectedField.id}</h4>
                    <button
                      onClick={handleDeleteField}
                      disabled={message.fields.length <= 1}
                      className="industrial-button-danger text-white px-3 py-1.5 rounded flex items-center gap-1 text-sm disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label htmlFor="fieldData">Data / Content</Label>
                      <Input
                        id="fieldData"
                        value={selectedField.data}
                        onChange={(e) => handleFieldDataChange(e.target.value)}
                        placeholder="Enter field text..."
                        className="mt-1 font-mono"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="fieldType">Type</Label>
                      <Select
                        value={selectedField.type}
                        onValueChange={(value) =>
                          setMessage((prev) => ({
                            ...prev,
                            fields: prev.fields.map((f) =>
                              f.id === selectedFieldId
                                ? { ...f, type: value as MessageField['type'] }
                                : f
                            ),
                          }))
                        }
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                          <SelectItem value="time">Time</SelectItem>
                          <SelectItem value="counter">Counter</SelectItem>
                          <SelectItem value="logo">Logo/Graphic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="fieldX">X</Label>
                        <Input
                          id="fieldX"
                          type="number"
                          value={selectedField.x}
                          onChange={(e) =>
                            setMessage((prev) => ({
                              ...prev,
                              fields: prev.fields.map((f) =>
                                f.id === selectedFieldId
                                  ? { ...f, x: parseInt(e.target.value) || 0 }
                                  : f
                              ),
                            }))
                          }
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="fieldY">Y</Label>
                        <Input
                          id="fieldY"
                          type="number"
                          value={selectedField.y}
                          onChange={(e) =>
                            setMessage((prev) => ({
                              ...prev,
                              fields: prev.fields.map((f) =>
                                f.id === selectedFieldId
                                  ? { ...f, y: parseInt(e.target.value) || 0 }
                                  : f
                              ),
                            }))
                          }
                          className="mt-1"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="fieldW">Width</Label>
                        <Input
                          id="fieldW"
                          type="number"
                          value={selectedField.width}
                          onChange={(e) =>
                            setMessage((prev) => ({
                              ...prev,
                              fields: prev.fields.map((f) =>
                                f.id === selectedFieldId
                                  ? { ...f, width: parseInt(e.target.value) || 50 }
                                  : f
                              ),
                            }))
                          }
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="fieldH">Height</Label>
                        <Input
                          id="fieldH"
                          type="number"
                          value={selectedField.height}
                          onChange={(e) =>
                            setMessage((prev) => ({
                              ...prev,
                              fields: prev.fields.map((f) =>
                                f.id === selectedFieldId
                                  ? { ...f, height: parseInt(e.target.value) || 16 }
                                  : f
                              ),
                            }))
                          }
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => onSave(message)}
              className="industrial-button-success text-white px-8 py-4 rounded-lg flex flex-col items-center min-w-[120px]"
            >
              <Save className="w-8 h-8 mb-1" />
              <span className="font-medium">Save</span>
            </button>

            <button
              onClick={onCancel}
              className="industrial-button-gray text-white px-8 py-4 rounded-lg flex flex-col items-center min-w-[120px]"
            >
              <X className="w-8 h-8 mb-1" />
              <span className="font-medium">Cancel</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
