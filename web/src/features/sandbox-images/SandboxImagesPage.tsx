import { Button, Popconfirm } from "@douyinfe/semi-ui";
import { Boxes, Network, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { createSandboxImage, deleteSandboxImage, querySandboxImages } from "../../shared/api/sandboxImages";
import type { CreateSandboxImageRequest, SandboxImage } from "../../shared/api/types";
import { ResourcePageShell } from "../../shared/components/ResourcePageShell";
import { ResourceTable, type ResourceColumn } from "../../shared/components/ResourceTable";
import { useAdminResourceHeader } from "../../shared/hooks/useAdminResourceHeader";
import { usePagedResourceList } from "../../shared/hooks/usePagedResourceList";
import { useResourceAction } from "../../shared/hooks/useResourceAction";
import { useResourceSubmit } from "../../shared/hooks/useResourceSubmit";
import { formatDateTime } from "../../shared/lib/date";
import { SandboxImageFormModal } from "./SandboxImageFormModal";

export function SandboxImagesPage() {
  const {
    items: images, page, keyword, loading, loadItems: loadImages, total, rangeStart, rangeEnd,
    setKeyword, search, previous, next, canGoBack, canGoNext,
  } = usePagedResourceList<SandboxImage>({ query: querySandboxImages });
  const [modalOpen, setModalOpen] = useState(false);

  const { run: deleteImage, busyId: deletingId } = useResourceAction<SandboxImage>(
    (image) => deleteSandboxImage(image.id), loadImages,
  );

  useAdminResourceHeader({
    createLabel: "Create Image",
    refreshLabel: "Refresh sandbox images",
    loading,
    onCreate: () => setModalOpen(true),
    onRefresh: loadImages,
  });

  const { saving, submit } = useResourceSubmit({
    onSuccess: async () => {
      setModalOpen(false);
      await loadImages();
    },
  });

  const summary = useMemo(
    () => images.reduce(
      (acc, image) => ({
        ports: acc.ports + (image.default_exposed_port > 0 ? 1 : 0),
      }),
      { ports: 0 },
    ),
    [images],
  );

  const handleCreate = (payload: CreateSandboxImageRequest) => submit(() => createSandboxImage(payload));

  const columns: ResourceColumn<SandboxImage>[] = [
    {
      key: "image", header: "Image", width: "minmax(280px, 360px)",
      render: (image) => (
        <div className="image-identity">
          <div className="resource-avatar"><Boxes size={18} /></div>
          <div>
            <strong>{image.image_name}</strong>
            <span><Network size={13} />Default port {image.default_exposed_port}</span>
          </div>
        </div>
      ),
    },
    { key: "port", header: "Default Port", width: "130px", render: (image) => image.default_exposed_port },
    { key: "created", header: "Created", width: "minmax(150px, 1fr)", render: (i) => formatDateTime(i.created_at) },
    { key: "updated", header: "Updated", width: "minmax(150px, 1fr)", render: (i) => formatDateTime(i.updated_at) },
    {
      key: "actions", header: "Actions", width: "104px",
      render: (image) => (
        <div className="row-actions">
          <Popconfirm title="Delete image" content={`Delete ${image.image_name}?`} okType="danger" onConfirm={() => void deleteImage(image)}>
            <Button icon={<Trash2 size={15} />} theme="borderless" type="danger"
              loading={deletingId === image.id} aria-label={`Delete ${image.image_name}`}
            />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <>
      <ResourcePageShell
        searchPlaceholder="Search image name"
        keyword={keyword}
        loading={loading}
        metrics={[
          { label: "Total", value: total },
          { label: "Configured Ports", value: summary.ports },
        ]}
        empty={images.length === 0}
        emptyIcon={<Boxes size={42} />}
        emptyTitle="No images found"
        page={page}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        total={total}
        canGoBack={canGoBack}
        canGoNext={canGoNext}
        onKeywordChange={setKeyword}
        onSearch={search}
        onPrevious={previous}
        onNext={next}
      >
        <ResourceTable<SandboxImage>
          ariaLabel="Sandbox images"
          columns={columns}
          rows={images}
          rowKey={(image) => image.id}
        />
      </ResourcePageShell>

      <SandboxImageFormModal
        open={modalOpen}
        saving={saving}
        onCancel={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />
    </>
  );
}
