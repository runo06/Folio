from django.urls import path

from . import views

urlpatterns = [
    path("registro/", views.RegistroVista.as_view(), name="registro"),
    path("token/", views.InicioSesionVista.as_view(), name="inicio-sesion"),
    path("token/refrescar/", views.RefrescarVista.as_view(), name="refrescar"),
    path("salir/", views.CerrarSesionVista.as_view(), name="cerrar-sesion"),
    path("yo/", views.YoVista.as_view(), name="yo"),
]
