import { useState, useEffect } from 'react';
import { Save, X, Plus, Trash2 } from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    width: 135,
    fields: [
      { id: 1, type: 'text', data: messageName, x: 0, y: 0, width: 87, height: 16 },
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

  const handleFieldDataChange = (value: string) => {
    if (!selectedFieldId) return;
    setMessage((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.id === selectedFieldId ? { ...f, data: value } : f
      ),
    }));
  };

  const handleAddField = () => {
    const newId = Math.max(0, ...message.fields.map((f) => f.id)) + 1;
    const newField: MessageField = {
      id: newId,
      type: 'text',
      data: '',
      x: 0,
      y: message.fields.length * 16,
      width: 50,
      height: 16,
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

  return (
    <div className="flex-1 p-4 flex flex-col">
      <SubPageHeader title={`Edit: ${messageName}`} onHome={onCancel} />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-muted-foreground">Loading message...</span>
        </div>
      ) : (
        <>
          {/* Message properties */}
          <div className="bg-card rounded-lg p-4 mb-4">
            <div className="grid grid-cols-3 gap-4">
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
                <Label htmlFor="msgHeight">Height</Label>
                <Input
                  id="msgHeight"
                  type="number"
                  value={message.height}
                  onChange={(e) =>
                    setMessage((prev) => ({
                      ...prev,
                      height: parseInt(e.target.value) || 16,
                    }))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="msgWidth">Width</Label>
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
            </div>
          </div>

          {/* Fields list */}
          <div className="bg-card rounded-lg p-4 mb-4 flex-1">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium">Fields ({message.fields.length})</h3>
              <div className="flex gap-2">
                <button
                  onClick={handleAddField}
                  className="industrial-button text-white px-3 py-1.5 rounded flex items-center gap-1 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
                <button
                  onClick={handleDeleteField}
                  disabled={message.fields.length <= 1}
                  className="industrial-button-danger text-white px-3 py-1.5 rounded flex items-center gap-1 text-sm disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Field list */}
              <div className="border rounded-lg overflow-hidden">
                {message.fields.map((field) => (
                  <div
                    key={field.id}
                    onClick={() => setSelectedFieldId(field.id)}
                    className={`p-3 border-b cursor-pointer hover:bg-muted/50 ${
                      selectedFieldId === field.id ? 'bg-primary/10' : ''
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
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium mb-3">Field {selectedField.id}</h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="fieldData">Data</Label>
                      <Input
                        id="fieldData"
                        value={selectedField.data}
                        onChange={(e) => handleFieldDataChange(e.target.value)}
                        placeholder="Enter field text..."
                        className="mt-1"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="fieldX">X Position</Label>
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
                        <Label htmlFor="fieldY">Y Position</Label>
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
