from django.urls import path

from . import views

urlpatterns = [
    path("colecciones/<int:pk>/preguntar/", views.PreguntarVista.as_view(), name="preguntar"),
    path(
        "colecciones/<int:pk>/conversaciones/",
        views.ConversacionesDeColeccionVista.as_view(),
        name="coleccion-conversaciones",
    ),
    path("conversaciones/<int:pk>/", views.ConversacionVista.as_view(), name="conversacion-detail"),
]
