"use client";
import { Btn, Field, Range } from "../studio-ui";
import { useStudio } from "../studio-context";

export default function BackgroundPanel() {
  const {
    bg,
    bgBitmap: bgBitmapRef,
    comp,
    hasBitmap,
    onBgFile,
    scrimPct,
    setHasBitmap,
    setScrimPct,
    update,
    uploadBg,
  } = useStudio();
  return (
<section aria-label="Background" className="space-y-3">
                  <h2 className="text-lg font-semibold">Background</h2>
                  <p className="text-sm" style={{ color: "var(--mute)" }}>
                    Templates and colours are in Look. Add a photo for a custom
                    background; Tamil text automatically gets a dark or light
                    veil so it stays readable.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Solid / gradient start">
                      <input
                        aria-label="Background colour A"
                        type="color"
                        className="pms-field"
                        value={comp.style.bg.a}
                        onChange={(e) =>
                          update((c) => {
                            c.style.bg.a = e.target.value;
                            return c;
                          }, "bga")
                        }
                      />
                    </Field>
                    <Field label="Gradient end">
                      <input
                        aria-label="Background colour B"
                        type="color"
                        className="pms-field"
                        value={comp.style.bg.b}
                        onChange={(e) =>
                          update((c) => {
                            c.style.bg.b = e.target.value;
                            c.style.bg.kind = "gradient";
                            return c;
                          }, "bgb")
                        }
                      />
                    </Field>
                    <Btn
                      onClick={() =>
                        update((c) => {
                          c.style.bg.kind = "solid";
                          return c;
                        })
                      }
                    >
                      Use solid colour
                    </Btn>
                    <Field label="Overlay colour">
                      <input
                        aria-label="Overlay colour"
                        type="color"
                        className="pms-field"
                        value={comp.style.overlay.color}
                        onChange={(e) =>
                          update((c) => {
                            c.style.overlay.color = e.target.value;
                            return c;
                          }, "ovc")
                        }
                      />
                    </Field>
                    <Range
                      label="Overlay opacity"
                      value={comp.style.overlay.opacity}
                      min={0}
                      max={0.9}
                      step={0.05}
                      onChange={(v) =>
                        update((c) => {
                          c.style.overlay.opacity = v;
                          return c;
                        }, "ovo")
                      }
                      fmt={(v) => v.toFixed(2)}
                    />
                  </div>
                  <div className="pms-card space-y-3">
                    <Field label="Photo from this device (stays local)">
                      <input
                        aria-label="Choose background photo"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/avif"
                        className="pms-field"
                        style={{ paddingTop: 8 }}
                        onChange={(e) => onBgFile(e.target.files?.[0])}
                      />
                    </Field>
                    {bg ? (
                      <>
                        {!hasBitmap && (
                          <p
                            className="text-sm"
                            style={{ color: "var(--warn-ink)" }}
                          >
                            {bg.url
                              ? "Using your saved library image."
                              : "This project's photo isn't on this device. Choose it again."}
                          </p>
                        )}
                        <Range
                          label="Zoom"
                          value={bg.zoom}
                          min={1}
                          max={3}
                          step={0.05}
                          onChange={(v) =>
                            update((c) => {
                              c.style.bg.image.zoom = v;
                              return c;
                            }, "bz")
                          }
                          fmt={(v) => `${v.toFixed(2)}×`}
                        />
                        <Range
                          label="Crop position left–right"
                          value={bg.x}
                          min={0}
                          max={1}
                          step={0.02}
                          onChange={(v) =>
                            update((c) => {
                              c.style.bg.image.x = v;
                              return c;
                            }, "bx")
                          }
                          fmt={(v) => `${Math.round(v * 100)}%`}
                        />
                        <Range
                          label="Crop position top–bottom"
                          value={bg.y}
                          min={0}
                          max={1}
                          step={0.02}
                          onChange={(v) =>
                            update((c) => {
                              c.style.bg.image.y = v;
                              return c;
                            }, "by")
                          }
                          fmt={(v) => `${Math.round(v * 100)}%`}
                        />
                        <Range
                          label="Brightness"
                          value={bg.brightness}
                          min={-0.5}
                          max={0.5}
                          step={0.02}
                          onChange={(v) =>
                            update((c) => {
                              c.style.bg.image.brightness = v;
                              return c;
                            }, "bb")
                          }
                          fmt={(v) => v.toFixed(2)}
                        />
                        <Range
                          label="Contrast"
                          value={bg.contrast}
                          min={-0.5}
                          max={0.5}
                          step={0.02}
                          onChange={(v) =>
                            update((c) => {
                              c.style.bg.image.contrast = v;
                              return c;
                            }, "bc")
                          }
                          fmt={(v) => v.toFixed(2)}
                        />
                        <Range
                          label="Blur"
                          value={bg.blur}
                          min={0}
                          max={40}
                          onChange={(v) =>
                            update((c) => {
                              c.style.bg.image.blur = v;
                              return c;
                            }, "bbl")
                          }
                        />
                        <p className="text-sm" style={{ color: "var(--mute)" }}>
                          Readability veil applied automatically:{" "}
                          {Math.round(scrimPct * 100)}%.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <label className="pms-btn inline-flex cursor-pointer items-center">
                            Save this photo to my image library
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="sr-only"
                              aria-label="Upload photo to library"
                              onChange={(e) => uploadBg(e.target.files?.[0])}
                            />
                          </label>
                          <Btn
                            onClick={() => {
                              bgBitmapRef.current?.close?.();
                              bgBitmapRef.current = null;
                              setHasBitmap(false); setScrimPct(0);
                              update((c) => {
                                delete c.style.bg.image;
                                return c;
                              });
                            }}
                          >
                            Remove photo
                          </Btn>
                        </div>
                        <p className="text-xs" style={{ color: "var(--mute)" }}>
                          Library uploads go to your existing Cloudinary account
                          (max 5 MB). Only photos you own or are licensed to use
                          should be added.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--mute)" }}>
                        No photo selected.
                      </p>
                    )}
                  </div>
                </section>
  );
}
