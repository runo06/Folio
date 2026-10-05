from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

# El router crea las rutas estándar de un ViewSet:
#   colecciones/        -> listar / crear
#   colecciones/<id>/   -> ver / renombrar / borrar
#   documentos/<id>/    -> ver / borrar
#   documentos/<id>/archivo/ -> el PDF (acción personalizada)
router = DefaultRouter()
router.register("colecciones", views.ColeccionViewSet, basename="coleccion")
router.register("documentos", views.DocumentoViewSet, basename="documento")

urlpatterns = [
    path(
        "colecciones/<int:pk>/documentos/",
        views.DocumentosDeColeccionVista.as_view(),
        name="coleccion-documentos",
    ),
    *router.urls,
]
